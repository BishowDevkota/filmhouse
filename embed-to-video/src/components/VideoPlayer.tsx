"use client";

import { CircleAlert, LoaderCircle, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import PlayerControls from "@/components/PlayerControls";
import type { StreamSource } from "@/types/video";

interface VideoPlayerProps {
  sources: StreamSource[];
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  /**
   * Selected source index. Provide this together with `onActiveIndexChange` to
   * drive the choice from outside (the page renders a second quality menu next
   * to the player); omit both to let the player own it.
   */
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
}

type PlayerStatus = "loading" | "ready" | "buffering" | "error";

/**
 * `HTMLMediaElement.error.code` explained in terms of what the viewer can do.
 *
 * A cross-origin refusal usually surfaces here as a bare network or
 * src-not-supported error with nothing in the message, so both mention it.
 */
const MEDIA_ERROR_MESSAGES: Record<number, string> = {
  1: "Playback was aborted.",
  2: "The connection to the media server was lost. If the server does not allow this origin, the browser blocks the request (a CORS restriction).",
  3: "This video could not be decoded. The file may be damaged or use a codec this browser does not support.",
  4: "This source could not be loaded. Either the format is unsupported, or the media server does not permit playback from this origin (a CORS restriction).",
};

/** Seconds jumped by the arrow-key shortcuts. */
const SEEK_STEP = 5;

/** PiP support cannot change for a loaded document, so nothing to subscribe to. */
const subscribeNever = () => () => {};
const VOLUME_STEP = 0.05;

export function VideoPlayer({
  sources,
  poster,
  title,
  autoPlay = false,
  activeIndex: controlledIndex,
  onActiveIndexChange,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guards hls.js recovery so a broken stream cannot loop forever. */
  const recoveryAttemptsRef = useRef(0);

  const [uncontrolledIndex, setUncontrolledIndex] = useState(0);
  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);

  // Reset the uncontrolled selection when a different result arrives. Adjusting
  // state during render is React's recommended alternative to an effect here.
  const [seenSources, setSeenSources] = useState(sources);
  if (seenSources !== sources) {
    setSeenSources(sources);
    setUncontrolledIndex(0);
  }

  const activeIndex = controlledIndex ?? uncontrolledIndex;
  const setActiveIndex = onActiveIndexChange ?? setUncontrolledIndex;

  /**
   * A browser capability rather than React state. Reading it through
   * `useSyncExternalStore` keeps the server render (no PiP button) and the
   * client render consistent without a post-mount setState.
   */
  const pipSupported = useSyncExternalStore(
    subscribeNever,
    () => Boolean(document.pictureInPictureEnabled),
    () => false,
  );

  /**
   * Show the chrome, then fade it out again while playback continues.
   * Declared before the media-element effect so its `play` handler can use it.
   */
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      // Never hide the chrome while paused — there is nothing to watch.
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false);
    }, 2600);
  }, []);

  // Clamp in case a shorter source list arrives while a later index is active.
  const source = sources[Math.min(activeIndex, Math.max(0, sources.length - 1))];

  /* ---------------------------------------------------------------------- */
  /* Engine attachment                                                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    let cancelled = false;
    let hlsInstance: { destroy: () => void } | null = null;
    let dashInstance: { reset: () => void; destroy?: () => void } | null = null;

    setStatus("loading");
    setErrorMessage(null);
    recoveryAttemptsRef.current = 0;

    const fail = (message: string) => {
      if (cancelled) return;
      setStatus("error");
      setErrorMessage(message);
    };

    const attach = async () => {
      // Safari plays HLS natively and does it better than MSE can.
      const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";

      if (source.type === "hls" && !nativeHls) {
        const { default: Hls } = await import("hls.js");
        if (cancelled) return;

        if (!Hls.isSupported()) {
          fail("This browser cannot play HLS streams.");
          return;
        }

        const hls = new Hls({ enableWorker: true, backBufferLength: 90 });
        hlsInstance = hls;

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && recoveryAttemptsRef.current < 2) {
            recoveryAttemptsRef.current += 1;
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveryAttemptsRef.current < 2) {
            recoveryAttemptsRef.current += 1;
            hls.recoverMediaError();
            return;
          }

          fail(
            data.type === Hls.ErrorTypes.NETWORK_ERROR
              ? "The stream could not be loaded. The media CDN may not allow playback from this origin (a CORS restriction), or the manifest is unavailable."
              : "This stream stopped unexpectedly and could not be recovered.",
          );
          hls.destroy();
        });

        hls.loadSource(source.url);
        hls.attachMedia(video);
        return;
      }

      if (source.type === "dash") {
        const dashjs = await import("dashjs");
        if (cancelled) return;

        const factory =
          (dashjs as { MediaPlayer?: () => { create: () => unknown } }).MediaPlayer ??
          (dashjs as { default?: { MediaPlayer?: () => { create: () => unknown } } }).default
            ?.MediaPlayer;

        if (!factory) {
          fail("The DASH player could not be initialised.");
          return;
        }

        const player = factory().create() as {
          initialize: (view: HTMLVideoElement, src: string, autoPlay: boolean) => void;
          on: (type: string, handler: (event: unknown) => void) => void;
          reset: () => void;
          destroy?: () => void;
        };

        player.on("error", () => {
          fail(
            "This DASH stream could not be played. It may be unavailable, or the media server may not permit this origin.",
          );
        });
        player.initialize(video, source.url, autoPlay);
        dashInstance = player;
        return;
      }

      // MP4, WebM, and HLS on Safari all play from a plain src.
      video.src = source.url;
      video.load();
    };

    void attach().catch(() => fail("This source could not be initialised."));

    return () => {
      cancelled = true;
      hlsInstance?.destroy();
      try {
        dashInstance?.reset();
      } catch {
        // dash.js can throw while tearing down a stream that never started.
      }
      video.removeAttribute("src");
      video.load();
    };
  }, [source, autoPlay]);

  /* ---------------------------------------------------------------------- */
  /* Media element events                                                    */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncBuffered = () => {
      if (video.buffered.length === 0) return;
      setBuffered(video.buffered.end(video.buffered.length - 1));
    };

    const handlers: Array<[keyof HTMLMediaElementEventMap, () => void]> = [
      ["loadedmetadata", () => setDuration(video.duration)],
      ["durationchange", () => setDuration(video.duration)],
      ["timeupdate", () => setCurrentTime(video.currentTime)],
      ["progress", syncBuffered],
      [
        "play",
        () => {
          setPlaying(true);
          setHasStarted(true);
          revealControls();
        },
      ],
      ["pause", () => setPlaying(false)],
      ["waiting", () => setStatus("buffering")],
      ["playing", () => setStatus("ready")],
      ["canplay", () => setStatus((current) => (current === "error" ? current : "ready"))],
      ["ratechange", () => setPlaybackRate(video.playbackRate)],
      [
        "volumechange",
        () => {
          setVolume(video.volume);
          setMuted(video.muted);
        },
      ],
      ["ended", () => setPlaying(false)],
      [
        "error",
        () => {
          const code = video.error?.code ?? 0;
          setStatus("error");
          setErrorMessage(MEDIA_ERROR_MESSAGES[code] ?? "This video could not be played.");
        },
      ],
    ];

    for (const [event, handler] of handlers) video.addEventListener(event, handler);
    return () => {
      for (const [event, handler] of handlers) video.removeEventListener(event, handler);
    };
  }, [revealControls]);

  useEffect(() => {
    // Picture-in-picture events are not in React's video typings, and PiP can
    // also be dismissed from the floating window, so listen natively.
    const video = videoRef.current;
    if (!video) return;

    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () =>
      setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Commands                                                                */
  /* ---------------------------------------------------------------------- */

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {
        // Autoplay policies reject silent play() calls; leave the poster up.
        setPlaying(false);
      });
    } else {
      video.pause();
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.min(Math.max(0, time), video.duration);
    setCurrentTime(video.currentTime);
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      seekTo(video.currentTime + delta);
    },
    [seekTo],
  );

  const changeVolume = useCallback((next: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.min(1, Math.max(0, next));
    video.volume = clamped;
    // Adjusting the slider away from zero implies the viewer wants sound.
    if (clamped > 0 && video.muted) video.muted = false;
    if (clamped === 0) video.muted = true;
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 0.5;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }

    if (container.requestFullscreen) {
      void container.requestFullscreen().catch(() => {});
      return;
    }

    // iOS Safari only offers fullscreen on the video element itself.
    const legacy = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    legacy?.webkitEnterFullscreen?.();
  }, []);

  const togglePip = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (document.pictureInPictureElement) {
      void document
        .exitPictureInPicture()
        .then(() => setPipActive(false))
        .catch(() => {});
      return;
    }
    void video
      .requestPictureInPicture()
      .then(() => setPipActive(true))
      .catch(() => setPipActive(false));
  }, []);

  const changeRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Controls visibility + keyboard                                          */
  /* ---------------------------------------------------------------------- */

  // Clear any pending hide timer on unmount.
  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Let the quality and speed menus keep their own keyboard behaviour.
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "range") {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      }

      const video = videoRef.current;
      if (!video) return;

      switch (event.key) {
        case " ":
        case "k":
          event.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          event.preventDefault();
          seekBy(-SEEK_STEP);
          break;
        case "ArrowRight":
          event.preventDefault();
          seekBy(SEEK_STEP);
          break;
        case "ArrowUp":
          event.preventDefault();
          changeVolume(video.volume + VOLUME_STEP);
          break;
        case "ArrowDown":
          event.preventDefault();
          changeVolume(video.volume - VOLUME_STEP);
          break;
        case "f":
          event.preventDefault();
          toggleFullscreen();
          break;
        case "m":
          event.preventDefault();
          toggleMute();
          break;
        default:
          return;
      }
      revealControls();
    },
    [changeVolume, revealControls, seekBy, toggleFullscreen, toggleMute, togglePlay],
  );

  const showPoster = !hasStarted && status !== "error";
  const busy = status === "loading" || status === "buffering";

  const ariaLabel = useMemo(() => (title ? `Video player: ${title}` : "Video player"), [title]);

  if (!source) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/50 text-sm text-zinc-500">
        No playable source.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseMove={revealControls}
      onMouseLeave={() => playing && setControlsVisible(false)}
      onTouchStart={revealControls}
      className="group relative aspect-video w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl shadow-black/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        autoPlay={autoPlay}
        preload="metadata"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        className="size-full bg-black object-contain"
      >
        Your browser does not support the video element.
      </video>

      {/* ---- Buffering / loading ---- */}
      {busy && !showPoster ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <LoaderCircle aria-hidden className="size-10 animate-spin text-white/80 drop-shadow" />
          <span className="sr-only">Loading video</span>
        </div>
      ) : null}

      {/* ---- Big play button before first playback ---- */}
      {showPoster ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play video"
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/25 transition hover:bg-black/15"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-white/95 shadow-xl transition group-hover:scale-105">
            {busy ? (
              <LoaderCircle aria-hidden className="size-6 animate-spin text-zinc-900" />
            ) : (
              <Play aria-hidden className="ml-1 size-7 fill-zinc-900 text-zinc-900" />
            )}
          </span>
        </button>
      ) : null}

      {/* ---- Playback error ---- */}
      {status === "error" ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
          <CircleAlert aria-hidden className="size-8 text-amber-400" />
          <p className="text-sm font-semibold text-zinc-100">This source would not play</p>
          <p className="max-w-md text-xs leading-relaxed text-zinc-400">{errorMessage}</p>
          {sources.length > 1 ? (
            <p className="text-xs text-zinc-500">Try a different quality from the menu below.</p>
          ) : null}
        </div>
      ) : null}

      <PlayerControls
        playing={playing}
        muted={muted}
        volume={volume}
        currentTime={currentTime}
        duration={duration}
        buffered={buffered}
        playbackRate={playbackRate}
        fullscreen={fullscreen}
        pipSupported={pipSupported}
        pipActive={pipActive}
        sources={sources}
        activeSourceIndex={activeIndex}
        visible={controlsVisible || !playing}
        onTogglePlay={togglePlay}
        onSeek={seekTo}
        onVolumeChange={changeVolume}
        onToggleMute={toggleMute}
        onToggleFullscreen={toggleFullscreen}
        onTogglePip={togglePip}
        onPlaybackRateChange={changeRate}
        onSelectSource={setActiveIndex}
      />
    </div>
  );
}

export default VideoPlayer;
