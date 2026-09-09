/**
 * Google IMA HTML5 SDK glue: loading ima3.js on demand and running a single
 * VAST pre-roll break.
 *
 * Shared by every place the site plays a video ad — the built-in <video>
 * player (<VastPlayer>) and the pre-roll gate shown in front of third-party
 * embed servers (<VastPreroll>).
 */

/** Narrow, structural typing for the IMA surface we use (no extra package). */
interface ImaAdDisplayContainer {
  initialize: () => void;
}

interface ImaAdsLoader {
  addEventListener: (
    type: string,
    listener: (event: ImaSdkEvent) => void,
  ) => void;
  requestAds: (request: ImaAdsRequest) => void;
  destroy?: () => void;
}

interface ImaAdsRequest {
  adTagUrl: string;
  linearAdSlotWidth: number;
  linearAdSlotHeight: number;
  /** Tells the ad server the break will start silent, so it can pick a
   *  creative that still makes sense without sound. */
  setAdWillPlayMuted?: (muted: boolean) => void;
}

interface ImaAdsManager {
  addEventListener: (
    type: string,
    listener: (event: ImaSdkEvent) => void,
  ) => void;
  init: (width: number, height: number, viewMode: string) => void;
  start: () => void;
  destroy: () => void;
  resize?: (width: number, height: number, viewMode: string) => void;
  setVolume?: (volume: number) => void;
}

interface ImaSdkEvent {
  type?: unknown;
  getAdsManager?: (video: HTMLVideoElement) => ImaAdsManager;
}

interface ImaSdk {
  AdDisplayContainer: new (
    container: HTMLElement,
    videoElement: HTMLVideoElement,
  ) => ImaAdDisplayContainer;
  AdsLoader: new (adDisplayContainer: ImaAdDisplayContainer) => ImaAdsLoader;
  AdsRequest: new () => ImaAdsRequest;
  AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } };
  AdErrorEvent: { Type: { AD_ERROR: string } };
  AdEvent: {
    Type: { CONTENT_RESUME_REQUESTED: string; ALL_ADS_COMPLETED: string };
  };
  ViewMode: { NORMAL: string };
}

type ImaWindow = { google?: { ima?: ImaSdk } };

/**
 * Nothing may gate playback forever. If the break hasn't started by this
 * point — no fill, a blocked imasdk.googleapis.com, a silent SDK — the
 * viewer gets their video instead of an empty box.
 */
const AD_START_TIMEOUT_MS = 8000;

/**
 * The in-flight (or settled) SDK load. Memoised rather than rediscovered from
 * the DOM: a <script> that has already errored never fires its listeners
 * again, so a second caller would otherwise wait forever on a dead element —
 * which is the common case, since ad blockers drop imasdk.googleapis.com.
 */
let sdkPromise: Promise<ImaSdk> | null = null;

/** Load imasdk.googleapis.com/ima3.js once; resolves with the SDK handle. */
export function loadImaSdk(): Promise<ImaSdk> {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<ImaSdk>((resolve, reject) => {
    const ima = (window as unknown as ImaWindow).google?.ima;
    if (ima) {
      resolve(ima);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
    script.async = true;
    script.onload = () => {
      const sdk = (window as unknown as ImaWindow).google?.ima;
      if (sdk) resolve(sdk);
      else reject(new Error("IMA SDK loaded but google.ima is unavailable"));
    };
    script.onerror = () =>
      reject(new Error("Failed to load the Google IMA SDK"));
    document.head.appendChild(script);
  });

  // A failure is remembered only long enough to reject this caller: dropping
  // the cache lets a later play retry from scratch (the host may just have
  // blipped) instead of the page giving up on ads for good.
  sdkPromise.catch(() => {
    sdkPromise = null;
  });

  return sdkPromise;
}

export interface PrerollOptions {
  /** Element IMA renders the ad and its controls into. */
  container: HTMLElement;
  /** Video element IMA uses for custom playback (iOS) and tracking. */
  video: HTMLVideoElement;
  adTagUrl: string;
  /** Start silent, which is what lets the break play without a click. */
  startMuted?: boolean;
  /** Fires when the ad actually starts rendering. */
  onAdStarted?: () => void;
  /** Fires exactly once when the break is over: completed, errored, or no fill. */
  onFinished: () => void;
}

export interface PrerollSession {
  /** Re-fits the ad to the stage; call when the container resizes. */
  resize: () => void;
  /** Turn the ad's sound on. Only honoured from inside a user gesture. */
  unmute: () => void;
  destroy: () => void;
}

function slotSize(container: HTMLElement): { width: number; height: number } {
  const width = container.clientWidth || 640;
  const height = container.clientHeight || Math.round((width * 9) / 16);
  return { width, height };
}

/**
 * Request and play one VAST pre-roll. `onFinished` always fires exactly once,
 * so the caller can start (or reveal) the real content without caring how the
 * break ended.
 *
 * With `startMuted` the break autoplays with no click at all: browser autoplay
 * policies block *sound* without a user gesture, not video, so a silent ad is
 * allowed to start on its own. `unmute()` turns the sound on afterwards, and
 * has to be called from a real click to be honoured.
 */
export function startPreroll({
  container,
  video,
  adTagUrl,
  startMuted = false,
  onAdStarted,
  onFinished,
}: PrerollOptions): PrerollSession {
  let disposed = false;
  let finished = false;
  let manager: ImaAdsManager | null = null;
  let loader: ImaAdsLoader | null = null;

  const watchdog = setTimeout(() => finish(), AD_START_TIMEOUT_MS);

  /** Ends the break exactly once, however we got here. */
  function finish(): void {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    if (!disposed) onFinished();
  }

  void loadImaSdk()
    .then((ima) => {
      if (disposed || finished) return;

      const adContainer = new ima.AdDisplayContainer(container, video);
      adContainer.initialize();

      loader = new ima.AdsLoader(adContainer);
      loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, finish);
      loader.addEventListener(
        ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
        (event) => {
          if (disposed || finished) return;
          const loaded = event.getAdsManager?.(video);
          if (!loaded) {
            finish();
            return;
          }
          manager = loaded;
          loaded.addEventListener(
            ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
            finish,
          );
          loaded.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, finish);
          loaded.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, finish);

          const { width, height } = slotSize(container);
          try {
            // Both paths have to be silenced: IMA plays the creative in its own
            // element on desktop and in `video` on iOS.
            if (startMuted) {
              video.muted = true;
              loaded.setVolume?.(0);
            }
            loaded.init(width, height, ima.ViewMode.NORMAL);
            loaded.start();
            // The ad is on screen: it now owns how long the break lasts.
            clearTimeout(watchdog);
            if (!disposed) onAdStarted?.();
          } catch {
            finish();
          }
        },
      );

      const request = new ima.AdsRequest();
      const { width, height } = slotSize(container);
      request.adTagUrl = adTagUrl;
      request.linearAdSlotWidth = width;
      request.linearAdSlotHeight = height;
      if (startMuted) request.setAdWillPlayMuted?.(true);
      try {
        loader.requestAds(request);
      } catch {
        finish();
      }
    })
    .catch(finish);

  return {
    resize() {
      if (disposed || !manager?.resize) return;
      const { width, height } = slotSize(container);
      manager.resize(width, height, "normal");
    },
    unmute() {
      if (disposed) return;
      video.muted = false;
      manager?.setVolume?.(1);
    },
    destroy() {
      disposed = true;
      clearTimeout(watchdog);
      try {
        manager?.destroy();
      } catch {
        // Already destroyed by the SDK.
      }
      manager = null;
      loader?.destroy?.();
      loader = null;
    },
  };
}
