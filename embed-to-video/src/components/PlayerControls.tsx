"use client";

import {
  Gauge,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import SourceSelector from "@/components/SourceSelector";
import type { StreamSource } from "@/types/video";
import { formatTime } from "@/lib/utils/format";

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export interface PlayerControlsProps {
  playing: boolean;
  muted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  /** Seconds buffered ahead, as an absolute timeline position. */
  buffered: number;
  playbackRate: number;
  fullscreen: boolean;
  pipSupported: boolean;
  pipActive: boolean;
  sources: StreamSource[];
  activeSourceIndex: number;
  /** Controls fade out during playback unless the pointer is over the player. */
  visible: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onTogglePip: () => void;
  onPlaybackRateChange: (rate: number) => void;
  onSelectSource: (index: number) => void;
}

function VolumeIcon({ muted, volume }: { muted: boolean; volume: number }) {
  if (muted || volume === 0) return <VolumeX aria-hidden className="size-4.5" />;
  if (volume < 0.5) return <Volume1 aria-hidden className="size-4.5" />;
  return <Volume2 aria-hidden className="size-4.5" />;
}

const BUTTON_CLASS =
  "inline-flex size-8 items-center justify-center rounded-md text-zinc-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * The player's chrome.
 *
 * Purely presentational — every piece of state and every handler comes from
 * `VideoPlayer`, which owns the media element. That keeps playback logic and
 * playback UI separable.
 */
export function PlayerControls(props: PlayerControlsProps) {
  const {
    playing,
    muted,
    volume,
    currentTime,
    duration,
    buffered,
    playbackRate,
    fullscreen,
    pipSupported,
    pipActive,
    sources,
    activeSourceIndex,
    visible,
  } = props;

  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const rateMenuRef = useRef<HTMLDivElement>(null);

  const seekable = Number.isFinite(duration) && duration > 0;
  const progress = seekable ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPercent = seekable ? Math.min(100, (buffered / duration) * 100) : 0;

  useEffect(() => {
    if (!rateMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rateMenuRef.current?.contains(event.target as Node)) setRateMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [rateMenuOpen]);

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pt-10 pb-2.5 transition-opacity duration-200 sm:px-4 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="pointer-events-auto flex flex-col gap-1.5">
        {/* ---- Scrubber ---- */}
        <div className="group relative flex h-4 items-center focus-within:outline-none">
          <div className="absolute inset-x-0 h-1 rounded-full bg-white/20" />
          <div
            className="absolute h-1 rounded-full bg-white/30"
            style={{ width: `${bufferedPercent}%` }}
          />
          <div
            className="absolute h-1 rounded-full bg-indigo-400"
            style={{ width: `${progress}%` }}
          />
          <div
            aria-hidden
            className="absolute size-3 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            style={{ left: `${progress}%` }}
          />
          <input
            type="range"
            min={0}
            max={seekable ? duration : 0}
            step={0.1}
            value={seekable ? Math.min(currentTime, duration) : 0}
            disabled={!seekable}
            aria-label="Seek"
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            onChange={(event) => props.onSeek(Number(event.target.value))}
            className="absolute inset-x-0 h-4 w-full cursor-pointer opacity-0"
          />
        </div>

        {/* ---- Buttons ---- */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={props.onTogglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className={BUTTON_CLASS}
          >
            {playing ? (
              <Pause aria-hidden className="size-4.5 fill-current" />
            ) : (
              <Play aria-hidden className="size-4.5 fill-current" />
            )}
          </button>

          {/* Volume: the slider expands on hover to keep the bar compact. */}
          <div className="group/volume flex items-center">
            <button
              type="button"
              onClick={props.onToggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className={BUTTON_CLASS}
            >
              <VolumeIcon muted={muted} volume={volume} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(event) => props.onVolumeChange(Number(event.target.value))}
              style={{ ["--progress" as string]: `${(muted ? 0 : volume) * 100}%` }}
              className="player-range h-4 w-0 opacity-0 transition-all duration-200 group-hover/volume:w-16 group-hover/volume:opacity-100 focus-visible:w-16 focus-visible:opacity-100 sm:w-16 sm:opacity-100"
            />
          </div>

          <span className="ml-1 font-mono text-[11px] tabular-nums text-zinc-300">
            {formatTime(currentTime)}
            <span className="mx-1 text-zinc-600">/</span>
            <span className="text-zinc-400">{formatTime(duration)}</span>
          </span>

          <div className="flex-1" />

          {/* ---- Playback speed ---- */}
          <div ref={rateMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setRateMenuOpen((value) => !value)}
              aria-haspopup="listbox"
              aria-expanded={rateMenuOpen}
              aria-label="Playback speed"
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
            >
              <Gauge aria-hidden className="size-4" />
              {playbackRate !== 1 ? <span>{playbackRate}×</span> : null}
            </button>

            {rateMenuOpen ? (
              <ul
                role="listbox"
                aria-label="Playback speed"
                className="absolute right-0 bottom-full z-30 mb-2 w-24 rounded-xl border border-zinc-700/80 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur"
              >
                {PLAYBACK_RATES.map((rate) => (
                  <li key={rate} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={rate === playbackRate}
                      onClick={() => {
                        props.onPlaybackRateChange(rate);
                        setRateMenuOpen(false);
                      }}
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                        rate === playbackRate
                          ? "bg-indigo-500/15 text-indigo-200"
                          : "text-zinc-300 hover:bg-white/5"
                      }`}
                    >
                      {rate === 1 ? "Normal" : `${rate}×`}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {sources.length > 1 ? (
            <SourceSelector
              sources={sources}
              activeIndex={activeSourceIndex}
              onSelect={props.onSelectSource}
              compact
            />
          ) : null}

          {pipSupported ? (
            <button
              type="button"
              onClick={props.onTogglePip}
              aria-label={pipActive ? "Exit picture-in-picture" : "Picture-in-picture"}
              className={BUTTON_CLASS}
            >
              <PictureInPicture2 aria-hidden className="size-4.5" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={props.onToggleFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            className={BUTTON_CLASS}
          >
            {fullscreen ? (
              <Minimize aria-hidden className="size-4.5" />
            ) : (
              <Maximize aria-hidden className="size-4.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PlayerControls;
