"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { StreamSource } from "@/types/video";
import { formatBitrate } from "@/lib/utils/format";

interface SourceSelectorProps {
  sources: StreamSource[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /** Rendered inside the player chrome rather than on the page. */
  compact?: boolean;
  disabled?: boolean;
}

/** Label for one entry in the menu. */
function labelFor(source: StreamSource): string {
  if (source.isMaster) return source.quality ?? "Auto";
  if (source.quality) return source.quality;
  if (source.height) return `${source.height}p`;
  return source.type.toUpperCase();
}

/** Filename from a media URL, used to tell same-resolution variants apart. */
function fileNameOf(rawUrl: string): string | null {
  try {
    const name = new URL(rawUrl).pathname.split("/").pop();
    return name ? decodeURIComponent(name) : null;
  } catch {
    return null;
  }
}

/**
 * Secondary line: format, bitrate when the provider published one, and the
 * filename — providers frequently publish several renditions at the same
 * declared height, and the filename is what actually distinguishes them.
 */
function detailFor(source: StreamSource): string {
  const parts = [source.type.toUpperCase()];

  const bitrate = formatBitrate(source.bitrate);
  if (bitrate) parts.push(bitrate);
  if (source.isMaster) parts.push("adaptive");

  const fileName = fileNameOf(source.url);
  if (fileName) parts.push(fileName);

  return parts.join(" · ");
}

/**
 * Quality menu.
 *
 * When the resolver returned an adaptive manifest there is usually only one
 * entry ("Auto"), because letting the player's ABR logic choose beats picking a
 * rendition up front.
 */
export function SourceSelector({
  sources,
  activeIndex,
  onSelect,
  compact = false,
  disabled = false,
}: SourceSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const active = sources[activeIndex];
  const isDisabled = disabled || sources.length === 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={isDisabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={
          compact
            ? "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-40"
            : "inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 disabled:opacity-40"
        }
      >
        {!compact ? <span className="text-zinc-500">Quality</span> : null}
        <span>{active ? labelFor(active) : "—"}</span>
        <ChevronDown aria-hidden className="size-3.5 opacity-70" />
      </button>

      {open ? (
        <ul
          id={menuId}
          role="listbox"
          aria-label="Video quality"
          className="absolute right-0 bottom-full z-30 mb-2 max-h-72 w-52 overflow-y-auto rounded-xl border border-zinc-700/80 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur"
        >
          {sources.map((source, index) => {
            const selected = index === activeIndex;
            return (
              <li key={source.url} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onSelect(index);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                    selected ? "bg-indigo-500/15 text-indigo-200" : "text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{labelFor(source)}</span>
                    <span className="text-[11px] text-zinc-500">{detailFor(source)}</span>
                  </span>
                  {selected ? <Check aria-hidden className="size-3.5 shrink-0" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export default SourceSelector;
