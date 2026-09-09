"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type HlsJs from "hls.js";
import VastPreroll, { PREROLL_ENABLED } from "@/components/VastPreroll";

/**
 * The site's own <video> player, fronted by the VAST pre-roll (<VastPreroll>).
 *
 * Two content kinds are supported:
 *   "progressive" → a direct .mp4/.webm fed straight to <video>
 *   "hls"         → an HLS manifest played through hls.js (or natively on
 *                   Safari)
 *
 * With a VAST tag configured the pre-roll plays by itself and the content
 * starts once the break ends (however it ends). With no tag the player behaves
 * exactly like a plain <video>: content autoplays.
 */

/**
 * Start playing, falling back to muted if the browser refuses.
 *
 * Nothing here collects a click any more — the pre-roll autoplays — so an
 * unmuted start can be rejected outright. Retrying muted is what browsers do
 * allow, and it beats leaving the viewer staring at a frozen first frame; the
 * native controls put sound one click away.
 */
function autoplay(video: HTMLVideoElement): void {
  void video.play().catch(() => {
    video.muted = true;
    void video.play().catch(() => {});
  });
}

export default function VastPlayer({
  kind,
  url,
  label,
}: {
  /** "hls" routes through hls.js; "progressive" plays the URL directly. */
  kind: "hls" | "progressive";
  url: string;
  /** Host label, used in the overlay and error copy. */
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<HlsJs | null>(null);
  const disposedRef = useRef(false);

  const [showAd, setShowAd] = useState(PREROLL_ENABLED);
  const [failed, setFailed] = useState(false);

  /** Kick off the real content: direct src for progressive, hls.js for HLS. */
  const startContent = useCallback(() => {
    const video = videoRef.current;
    if (!video || disposedRef.current) return;

    // A source change (new episode) must not leave the old manifest attached.
    hlsRef.current?.destroy();
    hlsRef.current = null;

    // The pre-roll leaves the element muted on the iOS playback path; the
    // content is a fresh start, so give it its sound back before trying.
    video.muted = false;

    if (kind === "progressive") {
      video.src = url;
      autoplay(video);
      return;
    }

    // Native HLS (Safari) or hls.js through Media Source Extensions.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      autoplay(video);
      return;
    }

    void import("hls.js").then(({ default: Hls }) => {
      if (disposedRef.current) return;
      if (!Hls.isSupported()) {
        setFailed(true);
        return;
      }
      const hls = new Hls();
      hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (!disposedRef.current) setFailed(true);
        hls.destroy();
        hlsRef.current = null;
      });
      // The autoPlay attribute alone can be refused for an unmuted stream, so
      // kick playback off explicitly once there is something to play.
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!disposedRef.current) autoplay(video);
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    });
  }, [kind, url]);

  // Runs on mount when no pre-roll is configured, and again the moment the
  // break reports itself over.
  useEffect(() => {
    if (!showAd) startContent();
  }, [showAd, startContent]);

  useEffect(() => {
    return () => {
      disposedRef.current = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, []);

  const onAdFinished = useCallback(() => setShowAd(false), []);

  return (
    <div className="absolute inset-0 h-full w-full bg-black">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full"
        controls
        playsInline
        autoPlay
      />

      {showAd ? <VastPreroll label={label} onFinished={onAdFinished} /> : null}

      {failed ? (
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
