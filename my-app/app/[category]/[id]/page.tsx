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
  posterUrl,
  toCardItem,
  type TmdbDetails,
} from "@/lib/tmdb";
import { SITE_NAME, absoluteUrl, breadcrumbLd, jsonLd } from "@/lib/site";

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
  if (!details) return { title: "Not found", robots: { index: false } };

  const name = getTitle(details);
  const year = getYear(details);
  const config = getCategory(category);
  const kind = config?.mediaType === "tv" ? "TV series" : "movie";

  // A bare name competes with every other listing for the same title, so the
  // year and medium go in the tag where Google can see them.
  const title = year ? `${name} (${year})` : name;
  const description =
    details.overview?.slice(0, 160) ||
    `Watch the ${kind} ${name}${year ? ` (${year})` : ""} on ${SITE_NAME} — trailer, cast, ratings and streaming servers.`;

  // Use the title's own artwork as the share preview image, otherwise
  // WhatsApp/Facebook/Twitter fall back to the site favicon (logo.png).
  const ogImage = details.poster_path
    ? {
        url: posterUrl(details.poster_path)!,
        width: 500,
        height: 750,
        alt: name,
      }
    : details.backdrop_path
      ? {
          url: backdropUrl(details.backdrop_path)!,
          width: 1920,
          height: 1080,
          alt: name,
        }
      : null;

  return {
    title,
    description,
    alternates: { canonical: `/${category}/${id}` },
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description,
      url: `/${category}/${id}`,
      type: "video.movie",
      images: ogImage ? [ogImage] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage.url] : undefined,
    },
  };
}

/**
 * Movie / TVSeries structured data. Google's video and rating rich results
 * read this, and a title page with no markup is invisible to them.
 */
function titleLd(
  details: TmdbDetails,
  category: { slug: string; label: string; mediaType: string },
  path: string,
) {
  const name = getTitle(details);
  const director = details.credits?.crew?.find((who) => who.job === "Director");

  return {
    "@context": "https://schema.org",
    "@type": category.mediaType === "tv" ? "TVSeries" : "Movie",
    name,
    url: absoluteUrl(path),
    description: details.overview || undefined,
    image: posterUrl(details.poster_path) ?? backdropUrl(details.backdrop_path) ?? undefined,
    datePublished: details.release_date || details.first_air_date || undefined,
    genre: details.genres?.map((genre) => genre.name),
    inLanguage: details.spoken_languages?.[0]?.english_name,
    numberOfSeasons: details.number_of_seasons,
    numberOfEpisodes: details.number_of_episodes,
    // Schema.org wants an ISO 8601 duration, not "128".
    duration: details.runtime ? `PT${details.runtime}M` : undefined,
    director: director ? { "@type": "Person", name: director.name } : undefined,
    actor: details.credits?.cast?.slice(0, 8).map((person) => ({
      "@type": "Person",
      name: person.name,
    })),
    // TMDB rates out of 10 and a rating node without votes is rejected.
    aggregateRating:
      details.vote_average && details.vote_count
        ? {
            "@type": "AggregateRating",
            ratingValue: details.vote_average.toFixed(1),
            bestRating: 10,
            worstRating: 0,
            ratingCount: details.vote_count,
          }
        : undefined,
    trailer: pickTrailer(details.videos?.results)
      ? {
          "@type": "VideoObject",
          name: `${name} — Trailer`,
          embedUrl: `https://www.youtube.com/embed/${pickTrailer(details.videos?.results)}`,
          thumbnailUrl: backdropUrl(details.backdrop_path) ?? undefined,
          uploadDate: details.release_date || details.first_air_date || undefined,
          description: details.overview || undefined,
        }
      : undefined,
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

  const path = `/${category.slug}/${id}`;
  const crumbs = breadcrumbLd([
    { name: "Home", path: "/" },
    { name: category.label, path: `/${category.slug}` },
    { name: title, path },
  ]);

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(titleLd(details, category, path))}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(crumbs)} />

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
