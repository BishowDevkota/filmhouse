"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { WatchEpisode, WatchSeriesGuide } from "@/lib/watch";

/** `/tv-shows/95350/watch-series?season=2&episode=5` */
function episodeHref(basePath: string, season: number, episode: number) {
  return `${basePath}?season=${season}&episode=${episode}`;
}

function padded(value: number) {
  return String(value).padStart(2, "0");
}

function EpisodeCard({
  episode,
  href,
  isActive,
}: {
  episode: WatchEpisode;
  href: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={isActive ? "true" : undefined}
      data-active={isActive ? "true" : undefined}
      className="group/ep w-56 flex-none rounded-xl p-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:w-64"
    >
      <div
        className={`relative aspect-video overflow-hidden rounded-lg bg-neutral-900 ring-1 transition ${
          isActive
            ? "ring-2 ring-brand"
            : "ring-white/10 group-hover/ep:ring-brand/50"
        }`}
      >
        {episode.still ? (
          <Image
            src={episode.still}
            alt=""
            fill
            sizes="(max-width: 640px) 224px, 256px"
            className={`object-cover transition duration-300 ${
              isActive ? "" : "opacity-75 group-hover/ep:opacity-100"
            }`}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-neutral-800 to-black text-2xl font-black text-neutral-700">
            E{padded(episode.number)}
          </div>
        )}

        <span className="absolute top-2 left-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-brand-bright backdrop-blur">
          E{padded(episode.number)}
        </span>

        {isActive ? (
          <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold tracking-[0.1em] text-black uppercase">
            Playing
          </span>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-3xl text-white opacity-0 transition group-hover/ep:opacity-90">
            ▶
          </span>
        )}
      </div>

      <p
        className={`mt-2 truncate text-sm font-semibold ${
          isActive ? "text-brand-bright" : "text-white"
        }`}
      >
        {episode.name}
      </p>
      <p className="mt-0.5 truncate text-xs text-neutral-400">
        {[episode.airDate, episode.runtimeLabel].filter(Boolean).join(" · ") ||
          "Air date TBA"}
      </p>
    </Link>
  );
}

/**
 * Season and episode controller for the series player. Every choice is a real
 * URL (`?season=&episode=`), so the server picks the stream and the selection
 * survives a refresh or a shared link.
 */
export default function EpisodePicker({
  basePath,
  guide,
}: {
  basePath: string;
  guide: WatchSeriesGuide;
}) {
  const router = useRouter();
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Keep the episode that is playing in view when the page loads deep in a season.
  useEffect(() => {
    const active = scrollerRef.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [guide.season, guide.episode]);

  const current = guide.episodes.find(
    (episode) => episode.number === guide.episode,
  );
  const index = guide.episodes.findIndex(
    (episode) => episode.number === guide.episode,
  );
  const previous = index > 0 ? guide.episodes[index - 1] : null;
  const next =
    index >= 0 && index < guide.episodes.length - 1
      ? guide.episodes[index + 1]
      : null;

  return (
    <section
      aria-label="Season and episode"
      className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-brand-surface/80 backdrop-blur"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-4 py-3.5 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-lg bg-brand px-2.5 py-1 text-sm font-black tracking-wide text-black">
            S{padded(guide.season)} · E{padded(guide.episode)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {current?.name ?? `Episode ${guide.episode}`}
            </p>
            <p className="truncate text-xs text-neutral-400">
              {guide.seasonName}
              {current?.airDate ? ` · ${current.airDate}` : ""}
              {current?.runtimeLabel ? ` · ${current.runtimeLabel}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="season-select">
            Season
          </label>
          <select
            id="season-select"
            value={guide.season}
            onChange={(event) =>
              router.push(episodeHref(basePath, Number(event.target.value), 1), {
                scroll: false,
              })
            }
            className="rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-sm font-semibold text-white transition hover:border-brand/60 focus:border-brand focus:outline-none"
          >
            {guide.seasons.map((season) => (
              <option key={season.number} value={season.number}>
                {season.name}
                {season.episodeCount ? ` (${season.episodeCount})` : ""}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            {previous ? (
              <Link
                href={episodeHref(basePath, guide.season, previous.number)}
                scroll={false}
                aria-label={`Previous episode: ${previous.name}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-lg text-white transition hover:border-brand/60 hover:text-brand"
              >
                ‹
              </Link>
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/5 text-lg text-neutral-700">
                ‹
              </span>
            )}
            {next ? (
              <Link
                href={episodeHref(basePath, guide.season, next.number)}
                scroll={false}
                aria-label={`Next episode: ${next.name}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-lg text-white transition hover:border-brand/60 hover:text-brand"
              >
                ›
              </Link>
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/5 text-lg text-neutral-700">
                ›
              </span>
            )}
          </div>
        </div>
      </div>

      {guide.episodes.length ? (
        <>
          <div
            ref={scrollerRef}
            className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-3 md:px-4"
          >
            {guide.episodes.map((episode) => (
              <EpisodeCard
                key={episode.id}
                episode={episode}
                href={episodeHref(basePath, guide.season, episode.number)}
                isActive={episode.number === guide.episode}
              />
            ))}
          </div>

          {current?.overview ? (
            <p className="border-t border-white/10 px-4 py-3.5 text-sm leading-relaxed text-neutral-300 md:px-5">
              {current.overview}
            </p>
          ) : null}
        </>
      ) : (
        <p className="px-4 py-4 text-sm text-neutral-500 md:px-5">
          Episode list unavailable for this season.
        </p>
      )}
    </section>
  );
}
