"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shows the backdrop, then fades a muted, looping YouTube trailer over it.
 * Sound is toggled through the YouTube iframe API's postMessage interface,
 * which avoids pulling in the external player script.
 */
export default function HeroPlayer({
  backdrop,
  title,
  trailerKey,
  muteClassName = "right-4 bottom-40 md:right-12 md:bottom-52",
  startDelayMs = 1800,
  paused = false,
}: {
  backdrop: string | null;
  title: string;
  trailerKey: string | null;
  muteClassName?: string;
  startDelayMs?: number;
  /** Stops the ambient preview, e.g. while the theater player is open. */
  paused?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (!trailerKey) return;
    // Let the backdrop land first, the way Netflix eases into its preview.
    const timer = setTimeout(() => setShowVideo(true), startDelayMs);
    return () => clearTimeout(timer);
  }, [trailerKey, startDelayMs]);

  /** Drives the embed through the YouTube iframe API's postMessage interface. */
  const command = useCallback((func: string) => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(
      JSON.stringify({ event: "command", func, args: [] }),
      "https://www.youtube.com",
    );
  }, []);

  useEffect(() => {
    if (!showVideo) return;
    command(paused ? "pauseVideo" : "playVideo");
  }, [paused, showVideo, command]);

  const toggleMute = () => {
    command(muted ? "unMute" : "mute");
    setMuted((current) => !current);
  };

  return (
    <>
      {backdrop ? (
        <img
          src={backdrop}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : (
        <div className="absolute inset-0 bg-neutral-800" />
      )}

      {trailerKey && showVideo ? (
        <div className="animate-fade-in pointer-events-none absolute inset-0 overflow-hidden">
          {/* Oversized so the 16:9 video always covers the hero box. */}
          <iframe
            ref={iframeRef}
            className="absolute top-1/2 left-1/2 h-[180%] w-[180%] -translate-x-1/2 -translate-y-1/2 sm:h-[135%] sm:w-[135%]"
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerKey}&modestbranding=1&rel=0&playsinline=1&enablejsapi=1&iv_load_policy=3`}
            title={`${title} trailer`}
            allow="autoplay; encrypted-media"
            tabIndex={-1}
          />
        </div>
      ) : null}

      {/* Gradients that keep the copy legible over image or video. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-brand-black to-transparent" />

      {trailerKey && showVideo ? (
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute trailer" : "Mute trailer"}
          className={`absolute z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-black/40 text-sm transition hover:bg-black/70 ${muteClassName}`}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      ) : null}
    </>
  );
}
