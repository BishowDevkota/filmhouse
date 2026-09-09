import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import ErrorState from "@/components/ErrorState";
import ProviderBadge from "@/components/ProviderBadge";
import VideoPlayer from "@/components/VideoPlayer";
import { resolveEmbed } from "@/lib/resolver";
import { formatTime, hostnameOf } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Player · Universal Video Player",
};

/** `?url=` may legitimately arrive repeated; take the first value. */
function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * A shareable player page.
 *
 * Unlike the home page, this resolves on the server during the render, so the
 * link can be handed to someone else and works on load. It calls `resolveEmbed`
 * directly rather than going back out through the HTTP API.
 */
export default async function PlayerPage(props: PageProps<"/player">) {
  const searchParams = await props.searchParams;
  const url = firstValue(searchParams.url);

  const result = url ? await resolveEmbed(url) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-300"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        Back to resolver
      </Link>

      {!url ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 px-6 py-16 text-center">
          <p className="text-sm font-medium text-zinc-300">No embed URL given.</p>
          <p className="mt-2 text-xs text-zinc-500">
            Add one as a query parameter, for example{" "}
            <code className="font-mono text-zinc-400">/player?url=https://…</code>
          </p>
        </div>
      ) : null}

      {result && !result.success ? (
        <ErrorState code={result.errorCode} message={result.error} />
      ) : null}

      {result?.success && result.sources.length > 0 ? (
        <div className="flex flex-col gap-4">
          <VideoPlayer
            sources={result.sources}
            poster={result.thumbnail}
            title={result.title}
            autoPlay
          />

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-sm font-semibold text-zinc-100">
                {result.title ?? "Resolved stream"}
              </span>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <ProviderBadge
                  provider={result.provider ?? "Unknown"}
                  detail={result.sources[0].type.toUpperCase()}
                />
                <span>{hostnameOf(result.sources[0].url)}</span>
                {result.duration ? <span>· {formatTime(result.duration)}</span> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
