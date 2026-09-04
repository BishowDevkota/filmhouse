import Image from "next/image";
import Link from "next/link";
import CastCarousel from "@/components/CastCarousel";
import EpisodePicker from "@/components/EpisodePicker";
import MediaCard from "@/components/MediaCard";
import ScoreRing from "@/components/ScoreRing";
import WatchServerPlayer from "@/components/WatchServerPlayer";
import type { StreamSource, WatchServer } from "@/lib/streaming";
import type { CardItem } from "@/lib/tmdb";
import type { WatchSeriesGuide, WatchTitleInfo } from "@/lib/watch";

/**
 * The player is capped both by pixels and by viewport height, so a 16:9 frame
 * always fits on screen without scrolling. Info blocks reuse the same width to
 * keep every edge on the page aligned with the player.
 */
const STAGE_WIDTH = { maxWidth: "min(1600px, calc(76vh * 16 / 9))" };

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span
        aria-hidden
        className="h-6 w-1 rounded-full bg-gradient-to-b from-brand-bright to-brand-deep"
      />
      <h2 className="text-lg font-bold tracking-wide text-white md:text-xl">
        {children}
      </h2>
    </div>
  );
}

/** Blurred key art behind the top of the page, fading into the black theme. */
function AmbientBackdrop({ src }: { src: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden md:h-[680px]"
    >
      <Image
        src={src}
        alt=""
        aria-hidden
        fill
        sizes="100vw"
        className="scale-110 object-cover object-top opacity-30 blur-2xl"
        loading="eager"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/85 to-black" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black to-transparent" />
    </div>
  );
}

/** Title, score and genres, sitting directly above the player. */
function StageHeader({ info }: { info: WatchTitleInfo }) {
  const quickFacts = [
    info.year,
    info.runtimeLabel,
    info.genres.slice(0, 3).join(" · ") || null,
  ].filter(Boolean) as string[];

  return (
    <header className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        <h1 className="text-shadow-hero text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
          {info.title}
        </h1>
        {info.tagline ? (
          <p className="text-shadow-hero mt-2 text-sm text-brand-bright/90 italic sm:text-base">
            “{info.tagline}”
          </p>
        ) : null}
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-300">
          {quickFacts.map((fact, index) => (
            <span key={fact} className="flex items-center gap-3">
              {index > 0 ? (
                <span aria-hidden className="text-neutral-600">
                  •
                </span>
              ) : null}
              {fact}
            </span>
          ))}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        {info.releaseDate ? (
          <div className="text-xs">
            <p className="font-bold tracking-[0.2em] text-neutral-500 uppercase">
              {info.releaseLabel}
            </p>
            <p className="mt-1 text-sm font-semibold text-neutral-200">
              {info.releaseDate}
            </p>
          </div>
        ) : null}

        {info.rating && info.score ? (
          <div className="flex items-center gap-3">
            <ScoreRing percent={info.rating} score={info.score} />
            <div className="text-xs">
              <p className="font-bold tracking-[0.2em] text-brand uppercase">
                TMDB Score
              </p>
              <p className="mt-1 text-neutral-400">
                {info.rating}% match
                {info.voteCount
                  ? ` · ${info.voteCount.toLocaleString("en-US")} votes`
                  : ""}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** Poster, synopsis, key facts and the people behind the title. */
function InfoPanel({ info }: { info: WatchTitleInfo }) {
  return (
    <section className="mt-12">
      <SectionHeading>
        About {info.mediaType === "tv" ? "the Series" : "the Movie"}
      </SectionHeading>

      <div className="grid gap-8 md:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
        {info.poster ? (
          <div className="relative mx-auto aspect-[2/3] w-40 self-start overflow-hidden rounded-2xl bg-neutral-900 shadow-[0_30px_70px_-25px_rgba(245,166,35,0.45)] ring-1 ring-white/15 md:mx-0 md:w-full">
            <Image
              src={info.poster}
              alt={`${info.title} poster`}
              fill
              sizes="(max-width: 768px) 160px, 200px"
              className="object-cover"
            />
          </div>
        ) : null}

        <div className="min-w-0 space-y-7">
          {info.genres.length ? (
            <div className="flex flex-wrap gap-2">
              {info.genres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand-bright"
                >
                  {genre}
                </span>
              ))}
            </div>
          ) : null}

          <div>
            <h3 className="text-xs font-bold tracking-[0.2em] text-neutral-500 uppercase">
              Synopsis
            </h3>
            <p className="mt-2 max-w-3xl text-base leading-relaxed text-neutral-200 md:text-lg">
              {info.overview ?? "No description available for this title yet."}
            </p>
          </div>

          {info.creators.length ? (
            <p className="text-sm text-neutral-300">
              <span className="text-xs font-bold tracking-[0.2em] text-neutral-500 uppercase">
                {info.creatorsLabel}
                {info.creators.length > 1 ? "s" : ""}
              </span>
              <span className="mt-1 block text-base font-semibold text-white">
                {info.creators.join(", ")}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {info.facts.length ? (
        // auto-fit keeps the strip full width whatever the fact count, without
        // leaving an empty trailing cell.
        <dl className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
          {info.facts.map((fact) => (
            <div key={fact.label} className="bg-brand-surface/90 px-5 py-4">
              <dt className="text-[11px] font-bold tracking-[0.18em] text-neutral-500 uppercase">
                {fact.label}
              </dt>
              <dd className="mt-1.5 text-sm font-medium text-neutral-100">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export default function WatchStage({
  title,
  backHref,
  servers,
  source,
  trailerKey,
  showNotice = true,
  info,
  related = [],
  guide,
  guideBasePath,
}: {
  title: string;
  backHref: string;
  /** Keyless source buttons (Server 1…N) rendered above the player. */
  servers?: WatchServer[];
  /** Single-source fallback used when no server list is passed. */
  source?: StreamSource | null;
  trailerKey: string | null;
  /** False on the dedicated trailer page, where playing just the trailer is expected. */
  showNotice?: boolean;
  /** Rich title metadata + cast shown on the full watch pages. */
  info?: WatchTitleInfo | null;
  /** Recommended titles rendered under the info panel. */
  related?: CardItem[];
  /** Season/episode controller, series only. */
  guide?: WatchSeriesGuide | null;
  /** Route the picker builds its `?season=&episode=` links from. */
  guideBasePath?: string;
}) {
  const backLabel = info?.title ?? title;
  // A server list counts as connected whenever any entry is configured.
  const hasPlayback = servers?.length
    ? servers.some((server) => server.enabled)
    : Boolean(source);

  return (
    <div className="relative bg-black pt-16 pb-16 md:pt-20">
      {info?.backdrop ? (
        <AmbientBackdrop src={info.backdrop} />
      ) : null}

      <div className="relative px-4 md:px-12">
        <div className="mx-auto w-full" style={STAGE_WIDTH}>
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <Link
              href={backHref}
              className="group flex items-center gap-2 text-sm font-medium text-neutral-300 transition hover:text-brand"
            >
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 transition group-hover:border-brand/60 group-hover:bg-brand/10"
              >
                ←
              </span>
              <span className="max-w-[52vw] truncate">Back to {backLabel}</span>
            </Link>

            <span className="flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-brand-bright uppercase">
              <span
                aria-hidden
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand"
              />
              Now Playing
            </span>
          </div>

          {info ? <StageHeader info={info} /> : null}

          <div className="mt-6">
            <WatchServerPlayer
              title={title}
              servers={servers ?? []}
              trailerKey={trailerKey}
              legacy={source}
            />
          </div>

          {guide && guideBasePath ? (
            <EpisodePicker basePath={guideBasePath} guide={guide} />
          ) : null}

          {hasPlayback || !showNotice ? null : (
            <p className="mt-4 rounded-xl border border-brand/40 bg-brand/10 px-4 py-2.5 text-xs text-brand-bright">
              Full playback isn&apos;t connected yet —{" "}
              {trailerKey ? "showing the trailer" : "no source available"}.
            </p>
          )}

          {info ? (
            <>
              <InfoPanel info={info} />

              {info.cast.length ? (
                <section className="mt-12">
                  <SectionHeading>Top Billed Cast</SectionHeading>
                  <CastCarousel cast={info.cast} />
                </section>
              ) : null}

              {related.length ? (
                <section className="mt-12">
                  <SectionHeading>More Like This</SectionHeading>
                  <div className="flex flex-wrap gap-x-2 gap-y-6">
                    {related.map((item) => (
                      <MediaCard
                        key={`${item.category}-${item.id}`}
                        item={item}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <h1 className="mt-4 text-xl font-bold md:text-2xl">{title}</h1>
          )}
        </div>
      </div>
    </div>
  );
}
