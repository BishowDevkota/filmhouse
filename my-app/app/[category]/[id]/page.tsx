import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import TitleHero from "@/components/TitleHero";
import { watchLabel, watchPath } from "@/lib/streaming";
import MediaGrid from "@/components/MediaGrid";
import SetupNotice from "@/components/SetupNotice";
import {
  backdropUrl,
  getCategory,
  getDetails,
  getTitle,
  getYear,
  hasTmdbToken,
  pickRelated,
  pickTrailer,
  toCardItem,
  type TmdbDetails,
} from "@/lib/tmdb";

function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

async function loadTitle(
  slug: string,
  id: string,
): Promise<TmdbDetails | null> {
  const category = getCategory(slug);
  if (!category) return null;
  try {
    // The slug fixes the TMDB endpoint: movie and TV ids overlap, so this is
    // never guessed.
    return await getDetails(category.mediaType, id);
  } catch (error) {
    console.error(`Failed to load ${slug}/${id}`, error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/[category]/[id]">): Promise<Metadata> {
  const { category, id } = await params;
  const details = await loadTitle(category, id);
  if (!details) return { title: "Not found — Filmhouse TV" };
  return {
    title: `${getTitle(details)} — Filmhouse TV`,
    description: details.overview?.slice(0, 160),
  };
}

export default async function TitlePage({
  params,
}: PageProps<"/[category]/[id]">) {
  const { category: slug, id } = await params;
  const category = getCategory(slug);
  if (!category) notFound();
  if (!hasTmdbToken()) return <SetupNotice />;

  const details = await loadTitle(slug, id);
  if (!details) notFound();

  const title = getTitle(details);
  const trailerKey = pickTrailer(details.videos?.results);
  const rating = details.vote_average
    ? Math.round(details.vote_average * 10)
    : null;

  const meta = [
    getYear(details),
    details.runtime ? formatRuntime(details.runtime) : null,
    details.number_of_seasons
      ? `${details.number_of_seasons} season${details.number_of_seasons > 1 ? "s" : ""}`
      : null,
    details.genres?.map((genre) => genre.name).join(", ") || null,
  ].filter(Boolean);

  const related = pickRelated(details);

  return (
    <article>
      <TitleHero
        backdrop={backdropUrl(details.backdrop_path)}
        title={title}
        trailerKey={trailerKey}
        watchHref={watchPath(category.slug, category.mediaType, details.id)}
        trailerHref={trailerKey ? `/${category.slug}/${id}/watch-trailer` : undefined}
        watchLabel={watchLabel(category.mediaType)}
      >
        <nav className="text-sm text-neutral-400">
          <Link href={`/${category.slug}`} className="hover:text-white">
            {category.label}
          </Link>
        </nav>
        <h1 className="text-shadow-hero text-3xl font-extrabold sm:text-5xl md:text-6xl">
          {title}
        </h1>
        {details.tagline ? (
          <p className="text-shadow-hero text-sm text-neutral-300 italic sm:text-base">
            {details.tagline}
          </p>
        ) : null}
      </TitleHero>

      <div className="space-y-8 px-4 py-10 md:px-12">
        <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
          {rating ? (
            <span className="rounded bg-brand px-2 py-0.5 font-semibold text-black">
              {rating}% match
            </span>
          ) : null}
          <span>{meta.join(" • ")}</span>
          {trailerKey ? null : (
            <span className="text-neutral-500">No trailer available</span>
          )}
        </div>

        <p className="max-w-3xl text-base leading-relaxed text-neutral-200 md:text-lg">
          {details.overview || "No description available for this title."}
        </p>

        {details.credits?.cast.length ? (
          <p className="max-w-3xl text-sm text-neutral-400">
            <span className="text-neutral-500">Cast: </span>
            {details.credits.cast
              .slice(0, 8)
              .map((person) => person.name)
              .join(", ")}
          </p>
        ) : null}
      </div>

      {related.length ? (
        <MediaGrid title="More Like This" items={related.map(toCardItem)} />
      ) : null}
    </article>
  );
}
