"use client";

import { Clapperboard, ExternalLink, Film, Keyboard } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import EmbedInput from "@/components/EmbedInput";
import ErrorState from "@/components/ErrorState";
import LoadingState from "@/components/LoadingState";
import ProviderBadge from "@/components/ProviderBadge";
import SourceSelector from "@/components/SourceSelector";
import VideoPlayer from "@/components/VideoPlayer";
import { formatTime, hostnameOf } from "@/lib/utils/format";
import type { ResolveErrorCode, ResolveResult } from "@/types/video";

type PanelStatus = "idle" | "resolving" | "success" | "error";

interface Failure {
  code?: ResolveErrorCode;
  message?: string;
}

const SHORTCUTS: Array<[string, string]> = [
  ["Space", "Play / pause"],
  ["← →", "Seek 5s"],
  ["↑ ↓", "Volume"],
  ["F", "Fullscreen"],
  ["M", "Mute"],
];

/**
 * The interactive half of the home page: submit a URL, show the resolve state,
 * and play the result in our own player.
 *
 * The original embed is never rendered — on success the only playback element
 * on the page is the `<video>` inside `VideoPlayer`.
 */
export function ResolvePanel() {
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [failure, setFailure] = useState<Failure>({});
  const [lastUrl, setLastUrl] = useState("");
  const [activeSource, setActiveSource] = useState(0);

  const resolve = useCallback(async (url: string) => {
    setStatus("resolving");
    setResult(null);
    setFailure({});
    setLastUrl(url);
    setActiveSource(0);

    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const payload = (await response.json()) as ResolveResult;

      if (payload.success && payload.sources.length > 0) {
        setResult(payload);
        setStatus("success");
        return;
      }

      setFailure({ code: payload.errorCode, message: payload.error });
      setStatus("error");
    } catch {
      // A rejected fetch means the request never completed — the API itself is
      // unreachable, which is distinct from the provider being unreachable.
      setFailure({
        code: "network_error",
        message: "The resolver API could not be reached. Check that the server is running.",
      });
      setStatus("error");
    }
  }, []);

  const sources = result?.sources ?? [];
  const active = sources[activeSource];

  return (
    <div className="flex flex-col gap-6">
      <EmbedInput onResolve={resolve} loading={status === "resolving"} />

      {status === "idle" ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 px-6 py-16 text-center">
          <Clapperboard aria-hidden className="size-8 text-zinc-700" />
          <p className="text-sm font-medium text-zinc-300">
            Paste an authorized embed URL to begin.
          </p>
          <p className="max-w-md text-xs leading-relaxed text-zinc-500">
            The embed page is fetched on the server, inspected for a direct stream, and the result
            is played here in a native HTML5 player — not in the original iframe.
          </p>
        </div>
      ) : null}

      {status === "resolving" ? <LoadingState /> : null}

      {status === "error" ? (
        <ErrorState
          code={failure.code}
          message={failure.message}
          onRetry={lastUrl ? () => void resolve(lastUrl) : undefined}
        />
      ) : null}

      {status === "success" && result && active ? (
        <div className="flex flex-col gap-4">
          {/*
            The selected quality is owned here so the menu in the player chrome
            and the one beside it stay in step.
          */}
          <VideoPlayer
            sources={sources}
            activeIndex={activeSource}
            onActiveIndexChange={setActiveSource}
            poster={result.thumbnail}
            title={result.title}
          />

          {/* ---- Result metadata ---- */}
          <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
                    <Film aria-hidden className="size-4 text-zinc-500" />
                    <span className="truncate">{result.title ?? "Resolved stream"}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <ProviderBadge
                    provider={result.provider ?? "Unknown"}
                    detail={active.type.toUpperCase()}
                  />
                  <span>{hostnameOf(active.url)}</span>
                  {result.duration ? <span>· {formatTime(result.duration)}</span> : null}
                  <span>
                    · {sources.length} source{sources.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {sources.length > 1 ? (
                  <SourceSelector
                    sources={sources}
                    activeIndex={activeSource}
                    onSelect={setActiveSource}
                  />
                ) : null}
                <Link
                  href={`/player?url=${encodeURIComponent(result.originalUrl)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
                >
                  <ExternalLink aria-hidden className="size-3.5" />
                  Open player page
                </Link>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-800 pt-3 text-[11px] text-zinc-600">
              <span className="inline-flex items-center gap-1.5">
                <Keyboard aria-hidden className="size-3.5" />
                Shortcuts
              </span>
              {SHORTCUTS.map(([key, action]) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <kbd className="rounded border border-zinc-700 bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                    {key}
                  </kbd>
                  {action}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ResolvePanel;
