"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type HlsJs from "hls.js";
import { VAST_TAG_URL } from "@/lib/vast";

/**
 * The site's own <video> player, with an optional VAST pre-roll served by the
 * Google IMA HTML5 SDK (ima3.js, loaded on demand).
 *
 * Two content kinds are supported:
 *   "progressive" → a direct .mp4/.webm/.m3u8 fed straight to <video>
 *   "hls"         → an HLS manifest played through hls.js (or natively on
 *                   Safari), same behaviour as the previous HlsVideo player
 *
 * When a VAST tag is configured (see lib/vast.ts) a "Play" overlay requests a
 * pre-roll ad. The ad runs in the same <video> element, then the real content
 * starts once the ad completes (or errors out / returns no fill). With no VAST
 * tag the player behaves exactly like a plain <video>: content autoplays.
 *
 * Note: pre-rolls only work where the site owns the <video> element. Third
 * party embed/iframe servers and YouTube trailers can't run IMA ads.
 */

/** Narrow, structural typing for the IMA surface we use (no extra package). */
interface ImaAdDisplayContainer {
  initialize: () => void;
}

interface ImaAdsLoader {
  addEventListener: (type: string, listener: (event: ImaSdkEvent) => void) => void;
  requestAds: (request: ImaAdsRequest) => void;
  destroy?: () => void;
}

interface ImaAdsRequest {
  adTagUrl: string;
  linearAdSlotWidth: number;
  linearAdSlotHeight: number;
}

interface ImaAdsManager {
  addEventListener: (type: string, listener: (event: ImaSdkEvent) => void) => void;
  init: (width: number, height: number, viewMode: string) => void;
  start: () => void;
  destroy: () => void;
  resize?: (width: number, height: number, viewMode: string) => void;
}

interface ImaSdkEvent {
  type?: unknown;
  getAdsManager?: (video: HTMLVideoElement) => ImaAdsManager;
}

interface ImaSdk {
  AdDisplayContainer: new (
    container: HTMLDivElement,
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

/** Load imasdk.googleapis.com/ima3.js once; resolves with the SDK handle. */
function loadImaSdk(): Promise<ImaSdk> {
  return new Promise((resolve, reject) => {
    const win = window as unknown as ImaWindow;
    const ima = win.google?.ima;
    if (ima) {
      resolve(ima);
      return;
    }

    const existing = document.getElementById("ima3-sdk") as HTMLScriptElement | null;
    const ready = () => {
      const sdk = (window as unknown as ImaWindow).google?.ima;
      if (sdk) resolve(sdk);
      else reject(new Error("IMA SDK loaded but google.ima is unavailable"));
    };
    if (existing) {
      existing.addEventListener("load", ready);
      return;
    }

    const script = document.createElement("script");
    script.id = "ima3-sdk";
    script.src = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
    script.async = true;
    script.onload = ready;
    script.onerror = () =>
      reject(new Error("Failed to load the Google IMA SDK"));
    document.head.appendChild(script);
  });
}

type Phase = "ready" | "loading-ad" | "ad" | "content" | "failed";

export default function VastPlayer({
  kind,
  url,
  label,
}: {
  /** "hls" routes through hls.js; "progressive" plays the URL directly. */
  kind: "hls" | "progressive";
  url: string;
  /** Host label, used in the fallback/error messages. */
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<HlsJs | null>(null);
  const adsLoaderRef = useRef<ImaAdsLoader | null>(null);
  const adsManagerRef = useRef<ImaAdsManager | null>(null);
  /** Content starts exactly once, however the ad phase ends. */
  const contentStartedRef = useRef(false);
  const disposedRef = useRef(false);

  const adEnabled = VAST_TAG_URL.trim().length > 0;
  const [phase, setPhase] = useState<Phase>(adEnabled ? "ready" : "content");

  /** Kick off the real content: direct src for progressive, hls.js for HLS. */
  const startContent = useCallback(() => {
    const video = videoRef.current;
    if (!video || disposedRef.current) return;
    setPhase("content");

    if (kind === "progressive") {
      video.src = url;
      void video.play().catch(() => {});
      return;
    }

    // Native HLS (Safari) or hls.js through Media Source Extensions.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      void video.play().catch(() => {});
      return;
    }

    void import("hls.js").then(({ default: Hls }) => {
      if (disposedRef.current) return;
      if (!Hls.isSupported()) {
        if (!disposedRef.current) setPhase("failed");
        return;
      }
      const hls = new Hls();
      hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (!disposedRef.current) setPhase("failed");
        hls.destroy();
        hlsRef.current = null;
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    });
  }, [kind, url]);

  // No VAST tag → skip the ad entirely, just like a plain <video>.
  useEffect(() => {
    if (!adEnabled && phase !== "content") startContent();
  }, [adEnabled, phase, startContent]);

  // Tear down SDK/HLS resources on unmount.
  useEffect(() => {
    return () => {
      disposedRef.current = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      try {
        adsManagerRef.current?.destroy();
      } catch {
        // Already destroyed by the SDK.
      }
      adsManagerRef.current = null;
      adsLoaderRef.current?.destroy?.();
      adsLoaderRef.current = null;
    };
  }, []);

  /** Play the VAST pre-roll, then hand over to the real content. */
  const playWithAds = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || disposedRef.current) {
      startContent();
      return;
    }

    /** No usable ad (SDK error, no fill, playback error) → straight to content. */
    const skipToContent = () => {
      if (!contentStartedRef.current) {
        contentStartedRef.current = true;
        startContent();
      }
    };

    void loadImaSdk()
      .then((ima) => {
        if (disposedRef.current) return;

        setPhase("loading-ad");
        const adContainer = new ima.AdDisplayContainer(container, video);
        const adsLoader = new ima.AdsLoader(adContainer);
        adsLoaderRef.current = adsLoader;
        adContainer.initialize();

        adsLoader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, skipToContent);
        adsLoader.addEventListener(
          ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
          (event) => {
            if (disposedRef.current) return;
            const manager = event.getAdsManager?.(video);
            if (!manager) {
              skipToContent();
              return;
            }
            adsManagerRef.current = manager;

            // Ad break finished — resume/start the actual content.
            const resume = () => {
              if (!contentStartedRef.current) {
                contentStartedRef.current = true;
                startContent();
              }
            };
            manager.addEventListener(
              ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
              resume,
            );
            manager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
              try {
                manager.destroy();
              } catch {
                // Already destroyed.
              }
              if (adsManagerRef.current === manager) {
                adsManagerRef.current = null;
              }
              resume();
            });
            manager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, resume);

            const width = container.clientWidth || 640;
            const height =
              container.clientHeight || Math.round((width * 9) / 16);
            try {
              manager.init(width, height, ima.ViewMode.NORMAL);
              manager.start();
              if (!disposedRef.current) setPhase("ad");
            } catch {
              resume();
            }
          },
        );

        const adsRequest = new ima.AdsRequest();
        adsRequest.adTagUrl = VAST_TAG_URL;
        adsRequest.linearAdSlotWidth = container.clientWidth || 640;
        adsRequest.linearAdSlotHeight = container.clientHeight || 360;
        try {
          adsLoader.requestAds(adsRequest);
        } catch {
          skipToContent();
        }
      })
      .catch(skipToContent);
  }, [startContent]);

  // Keep the ad video filling the stage if the box resizes mid-ad.
  useEffect(() => {
    if (phase !== "ad") return;
    const container = containerRef.current;
    const manager = adsManagerRef.current;
    if (!container || !manager?.resize) return;

    const onResize = () => {
      const width = container.clientWidth || 640;
      const height = container.clientHeight || Math.round((width * 9) / 16);
      manager.resize?.(width, height, "normal");
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full bg-black"
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full"
        controls
        playsInline
        autoPlay={!adEnabled}
      />

      {phase === "ready" && adEnabled ? (
        <button
          type="button"
          onClick={playWithAds}
          aria-label={`Play ${label}`}
          className="absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/70 via-black/40 to-black/70 transition hover:from-black/60 hover:via-black/30"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/25 bg-white/10 pl-1 text-2xl text-white shadow-[0_10px_40px_-10px_rgba(235,18,24,0.8)] backdrop-blur transition group-hover:scale-105">
            ▶
          </span>
          <span className="text-sm font-bold tracking-[0.18em] text-white uppercase">
            Play
          </span>
          <span className="text-xs text-neutral-400">
            A short ad plays before {label}
          </span>
        </button>
      ) : null}

      {phase === "loading-ad" && adEnabled ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center">
          <span
            aria-hidden
            className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-brand"
          />
          <p className="text-sm text-neutral-300">Loading ad…</p>
        </div>
      ) : null}

      {phase === "ad" && adEnabled ? (
        <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-md border border-white/15 bg-black/70 px-2.5 py-1 text-[11px] font-bold tracking-[0.18em] text-white uppercase">
          <span
            aria-hidden
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand"
          />
          Ad
        </div>
      ) : null}

      {phase === "failed" ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6 text-center">
          <p className="text-sm text-neutral-300">
            {label} wouldn&apos;t start — the host may be blocking direct
            playback. Try another server.
          </p>
        </div>
      ) : null}
    </div>
  );
}
