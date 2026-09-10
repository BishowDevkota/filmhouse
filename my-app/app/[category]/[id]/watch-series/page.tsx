import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WatchStage from "@/components/WatchStage";
import SetupNotice from "@/components/SetupNotice";
import { getWatchServers } from "@/lib/streaming";
import {
  resolveEpisode,
  resolveSeason,
  toSeriesGuide,
  toWatchInfo,
} from "@/lib/watch";
import {
  getCategory,
  getDetails,
  getSeason,
  getTitle,
  hasTmdbToken,
  pickRelated,
  toCardItem,
  type TmdbDetails,
  type TmdbSeason,
} from "@/lib/tmdb";
import { SITE_NAME } from "@/lib/site";

async function getSeriesDetails(id: string): Promise<TmdbDetails | null> {
  try {
    return await getDetails("tv", id);
  } catch (error) {
    console.error(`Failed to load watch-series/${id}`, error);
    return null;
  }
}

/** A missing season shouldn't break playback — the picker just goes quiet. */
async function getSeriesSeason(
  id: number,
  seasonNumber: number,
): Promise<TmdbSeason | null> {
  try {
    return await getSeason(id, seasonNumber);
  } catch (error) {
    console.error(`Failed to load tv/${id}/season/${seasonNumber}`, error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/[category]/[id]/watch-series">): Promise<Metadata> {
  const { category, id } = await params;
  const details = await getSeriesDetails(id);
  if (!details) return { title: "Not found", robots: { index: false } };

  const name = getTitle(details);
  const title = `Watch ${name} Online Free`;
  const description =
    details.overview?.slice(0, 160) ||
    `Stream every season of ${name} on ${SITE_NAME} — multiple servers, no signup.`;

  return {
    title,
    description,
    // Season and episode live in ?s=&e=, which would split one page into
    // hundreds of near-identical URLs. Point them all at the clean one.
    alternates: { canonical: `/${category}/${id}/watch-series` },
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description,
      url: `/${category}/${id}/watch-series`,
      type: "video.tv_show",
    },
  };
}

export default async function WatchSeriesPage({
  params,
  searchParams,
}: PageProps<"/[category]/[id]/watch-series">) {
  const { category: slug, id } = await params;

  // Only TV categories (tv-shows, anime, hindi-tv-shows) lead here; movies
  // belong on /…/watch-movie.
  const category = getCategory(slug);
  if (!category || category.mediaType !== "tv") notFound();
  if (!hasTmdbToken()) return <SetupNotice />;

  const details = await getSeriesDetails(id);
  if (!details) notFound();

  // `?season=` and `?episode=` drive the stream, so a shared link replays the
  // same episode. Both are clamped to what the show actually has.
  const query = await searchParams;
  const seasonNumber = resolveSeason(details, query.season);
  const season = await getSeriesSeason(details.id, seasonNumber);
  const episodeNumber = resolveEpisode(query.episode, season?.episodes ?? []);

  return (
    <WatchStage
      title={getTitle(details)}
      backHref={`/${category.slug}/${id}`}
      servers={getWatchServers("tv", details.id, {
        season: seasonNumber,
        episode: episodeNumber,
      })}
      trailerKey={null}
      info={toWatchInfo(details, "tv")}
      related={pickRelated(details).map(toCardItem)}
      guide={toSeriesGuide(details, season, seasonNumber, episodeNumber)}
      guideBasePath={`/${category.slug}/${id}/watch-series`}
    />
  );
}
