import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WatchStage from "@/components/WatchStage";
import SetupNotice from "@/components/SetupNotice";
import { getWatchServers } from "@/lib/streaming";
import { toWatchInfo } from "@/lib/watch";
import {
  getCategory,
  getDetails,
  getTitle,
  hasTmdbToken,
  pickRelated,
  toCardItem,
  type TmdbDetails,
} from "@/lib/tmdb";
import { SITE_NAME } from "@/lib/site";

async function getMovieDetails(id: string): Promise<TmdbDetails | null> {
  try {
    return await getDetails("movie", id);
  } catch (error) {
    console.error(`Failed to load watch-movie/${id}`, error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/[category]/[id]/watch-movie">): Promise<Metadata> {
  const { category, id } = await params;
  const details = await getMovieDetails(id);
  if (!details) return { title: "Not found", robots: { index: false } };

  const name = getTitle(details);
  const title = `Watch ${name} Online Free`;
  const description =
    details.overview?.slice(0, 160) ||
    `Stream ${name} on ${SITE_NAME} — multiple servers, no signup.`;

  return {
    title,
    description,
    alternates: { canonical: `/${category}/${id}/watch-movie` },
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description,
      url: `/${category}/${id}/watch-movie`,
      type: "video.movie",
    },
  };
}

export default async function WatchMoviePage({
  params,
}: PageProps<"/[category]/[id]/watch-movie">) {
  const { category: slug, id } = await params;

  // This page only makes sense under a movie category (movies, anime-movies,
  // hindi-movies). Series titles belong on /…/watch-series instead.
  const category = getCategory(slug);
  if (!category || category.mediaType !== "movie") notFound();
  if (!hasTmdbToken()) return <SetupNotice />;

  const details = await getMovieDetails(id);
  if (!details) notFound();

  return (
    <WatchStage
      title={getTitle(details)}
      backHref={`/${category.slug}/${id}`}
      servers={getWatchServers("movie", details.id)}
      trailerKey={null}
      info={toWatchInfo(details, "movie")}
      related={pickRelated(details).map(toCardItem)}
    />
  );
}
