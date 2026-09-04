import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WatchStage from "@/components/WatchStage";
import SetupNotice from "@/components/SetupNotice";
import {
  getCategory,
  getDetails,
  getTitle,
  hasTmdbToken,
  pickTrailer,
  type TmdbDetails,
} from "@/lib/tmdb";

async function getDetailsForSlug(
  slug: string,
  id: string,
): Promise<TmdbDetails | null> {
  const category = getCategory(slug);
  if (!category) return null;
  try {
    return await getDetails(category.mediaType, id);
  } catch (error) {
    console.error(`Failed to load watch-trailer/${slug}/${id}`, error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/[category]/[id]/watch-trailer">): Promise<Metadata> {
  const { category: slug, id } = await params;
  const details = await getDetailsForSlug(slug, id);
  return {
    title: details ? `Trailer ${getTitle(details)} — Clips Hub` : "Not found",
  };
}

export default async function WatchTrailerPage({
  params,
}: PageProps<"/[category]/[id]/watch-trailer">) {
  const { category: slug, id } = await params;

  const category = getCategory(slug);
  if (!category) notFound();
  if (!hasTmdbToken()) return <SetupNotice />;

  const details = await getDetailsForSlug(slug, id);
  if (!details) notFound();

  const trailerKey = pickTrailer(details.videos?.results);

  return (
    <WatchStage
      title={`${getTitle(details)} — Trailer`}
      backHref={`/${category.slug}/${id}`}
      source={null}
      trailerKey={trailerKey}
      showNotice={false}
    />
  );
}
