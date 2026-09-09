"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startPreroll, type PrerollSession } from "@/lib/ima";
import { VAST_TAG_URL } from "@/lib/vast";

/**
 * A stage-filling VAST pre-roll that plays on its own: ad → `onFinished`.
 *
 * There is no Play gate. The break starts silent the moment the component
 * mounts, which is what makes that legal — browser autoplay policies block
 * sound without a user gesture, not video — and a single "Sound on" button
 * lets the viewer opt back in.
 *
 * It owns nothing but the ad, which is what lets it sit in front of anything —
 * the site's own <video> (<VastPlayer>) or a third-party embed iframe. An IMA
 * ad can't run *inside* a cross-origin player, so for embeds it runs in front
 * and the iframe is only mounted once this component reports the break over.
 *
 * `onFinished` fires exactly once whatever happens (ad completed, no fill, SDK
 * blocked, autoplay refused, timeout), so playback is never gated on an ad
 * that never arrives.
 */

/** False when NEXT_PUBLIC_VAST_TAG_URL is blank — then there is no ad to show. */
export const PREROLL_ENABLED = VAST_TAG_URL.trim().length > 0;

type Phase = "loading" | "ad";

export default function VastPreroll({
  label,
  onFinished,
}: {
  /** What plays after the ad, named in the loading copy. */
  label: string;
  onFinished: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<PrerollSession | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [muted, setMuted] = useState(true);

  // Request the ad as soon as the stage exists. onFinished is memoised by both
  // callers, so this runs once per break rather than on every render.
  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) {
      onFinished();
      return;
    }

    const session = startPreroll({
      container,
      video,
      adTagUrl: VAST_TAG_URL,
      startMuted: true,
      onAdStarted: () => setPhase("ad"),
      onFinished,
    });
    sessionRef.current = session;

    return () => {
      session.destroy();
      sessionRef.current = null;
    };
  }, [onFinished]);

  // Keep the ad filling the stage if the box resizes mid-ad (e.g. fullscreen).
  useEffect(() => {
    if (phase !== "ad") return;
    const onResize = () => sessionRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  // The click itself is the gesture that lets the browser honour the unmute.
  const unmute = useCallback(() => {
    sessionRef.current?.unmute();
    setMuted(false);
  }, []);

  return (
    <div className="absolute inset-0 h-full w-full bg-black">
      {/* IMA plays the ad in its own element on desktop and in this one on
          iOS, where the OS only allows playback in a video the page owns. */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full"
        playsInline
        muted
      />
      <div ref={containerRef} className="absolute inset-0 z-10" />

      {phase === "loading" ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center">
          <span
            aria-hidden
            className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-brand"
          />
          <p className="text-sm text-neutral-300">Loading {label}…</p>
        </div>
      ) : null}

      {phase === "ad" ? (
        <>
          <div className="pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-2 rounded-md border border-white/15 bg-black/70 px-2.5 py-1 text-[11px] font-bold tracking-[0.18em] text-white uppercase">
            <span
              aria-hidden
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand"
            />
            Ad
          </div>

          {muted ? (
            <button
              type="button"
              onClick={unmute}
              className="absolute top-3 right-3 z-20 flex cursor-pointer items-center gap-2 rounded-md border border-white/20 bg-black/70 px-3 py-1.5 text-[11px] font-bold tracking-[0.14em] text-white uppercase backdrop-blur transition hover:border-brand/60 hover:bg-black/85 hover:text-brand-bright"
            >
              <span aria-hidden>🔇</span>
              Sound on
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
