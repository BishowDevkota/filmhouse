"use client";

import { Link2, LoaderCircle, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { PARSE_FAILURE_MESSAGES, parseEmbedInput } from "@/lib/utils/iframe";
import { truncateUrl } from "@/lib/utils/format";

interface EmbedInputProps {
  onResolve: (url: string) => void;
  loading?: boolean;
  initialValue?: string;
}

/** Public, CORS-friendly sources that demonstrate each playback path. */
const EXAMPLES: Array<{ label: string; url: string; note: string }> = [
  {
    label: "HLS test stream",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    note: "Adaptive master playlist",
  },
  {
    label: "MP4 file",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    note: "Progressive download",
  },
  {
    label: "Internet Archive",
    url: "https://archive.org/embed/ElephantsDream",
    note: "Resolved via public API; multiple qualities",
  },
];

/**
 * The URL field.
 *
 * Accepts a bare embed URL or a whole `<iframe>` tag pasted from a share
 * dialog, and says which one it recognised before anything is submitted, so a
 * malformed paste is obvious without a round trip to the server.
 */
export function EmbedInput({ onResolve, loading = false, initialValue = "" }: EmbedInputProps) {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  const parsed = useMemo(() => (value.trim() ? parseEmbedInput(value) : null), [value]);
  const showError = touched && parsed !== null && !parsed.ok;

  const submit = () => {
    setTouched(true);
    if (!parsed?.ok || loading) return;
    onResolve(parsed.url);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3"
    >
      <div
        className={`flex flex-col gap-2 rounded-2xl border bg-zinc-900/60 p-2 transition focus-within:border-indigo-500/60 sm:flex-row sm:items-start ${
          showError ? "border-amber-700/70" : "border-zinc-800"
        }`}
      >
        <div className="flex flex-1 items-start gap-2 px-2 py-1.5">
          <Link2 aria-hidden className="mt-1.5 size-4 shrink-0 text-zinc-500" />
          <textarea
            value={value}
            rows={1}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(event) => {
              // Enter submits; Shift+Enter keeps the newline for pasted markup.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Paste an embed URL, or a full <iframe> tag"
            aria-label="Embed URL or iframe tag"
            aria-invalid={showError}
            spellCheck={false}
            className="max-h-40 min-h-[1.75rem] w-full resize-y bg-transparent font-mono text-sm text-zinc-100 placeholder:font-sans placeholder:text-zinc-600 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !parsed?.ok}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {loading ? (
            <>
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
              Resolving
            </>
          ) : (
            "Resolve"
          )}
        </button>
      </div>

      {/* ---- Inline parse feedback ---- */}
      <div className="min-h-5 px-1 text-xs" aria-live="polite">
        {showError ? (
          <span className="text-amber-400">{PARSE_FAILURE_MESSAGES[parsed.reason]}</span>
        ) : parsed?.ok && parsed.source === "iframe" ? (
          <span className="text-emerald-400">
            Extracted src from iframe:{" "}
            <span className="font-mono text-emerald-300/80">{truncateUrl(parsed.url)}</span>
          </span>
        ) : (
          <span className="text-zinc-600">
            Only public, authorized embeds are resolved. DRM and access controls are never bypassed.
          </span>
        )}
      </div>

      {/* ---- Examples ---- */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
          <Sparkles aria-hidden className="size-3" />
          Try
        </span>
        {EXAMPLES.map((example) => (
          <button
            key={example.url}
            type="button"
            title={example.note}
            onClick={() => {
              setValue(example.url);
              setTouched(false);
              onResolve(example.url);
            }}
            disabled={loading}
            className="rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50"
          >
            {example.label}
          </button>
        ))}
      </div>
    </form>
  );
}

export default EmbedInput;
