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
import { SITE_NAME } from "@/lib/site";

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
  if (!details) return { title: "Not found", robots: { index: false } };

  const name = getTitle(details);
  const title = `${name} — Official Trailer`;
  const description = `Watch the official trailer for ${name} on ${SITE_NAME}.`;

  return {
    title,
    description,
    alternates: { canonical: `/${slug}/${id}/watch-trailer` },
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description,
      url: `/${slug}/${id}/watch-trailer`,
      type: "video.other",
    },
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
