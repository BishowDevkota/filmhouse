import HeroPlayer from "@/components/HeroPlayer";
import HeroActions from "@/components/HeroActions";
import { watchLabel, watchPath } from "@/lib/streaming";
import {
  backdropUrl,
  getCategorySlug,
  getDetails,
  getList,
  getMediaType,
  getTitle,
  pickTrailer,
} from "@/lib/tmdb";

export default async function Hero() {
  const trending = await getList("/trending/all/week");
  const featured = trending.find((item) => item.backdrop_path && item.overview);

  if (!featured) return null;

  const mediaType = getMediaType(featured);
  const title = getTitle(featured);

  // Trailer lookup is a second request; a missing one just leaves the backdrop.
  let trailerKey: string | null = null;
  try {
    const details = await getDetails(mediaType, featured.id);
    trailerKey = pickTrailer(details.videos?.results);
  } catch (error) {
    console.error("Failed to load hero trailer", error);
  }

  return (
    <section className="relative h-[56vw] max-h-[85vh] min-h-[420px] w-full overflow-hidden">
      <HeroPlayer
        backdrop={backdropUrl(featured.backdrop_path)}
        title={title}
        trailerKey={trailerKey}
      />

      <div className="relative z-10 flex h-full max-w-2xl flex-col justify-end gap-4 px-4 pb-40 md:px-12 md:pb-52">
        <h1 className="text-shadow-hero text-3xl font-extrabold sm:text-5xl md:text-6xl">
          {title}
        </h1>
        <p className="text-shadow-hero line-clamp-3 max-w-xl text-sm text-neutral-200 sm:text-base md:text-lg">
          {featured.overview}
        </p>
        <HeroActions
          watchHref={watchPath(getCategorySlug(featured), mediaType, featured.id)}
          infoHref={`/${getCategorySlug(featured)}/${featured.id}`}
          watchLabel={watchLabel(mediaType)}
        />
      </div>
    </section>
  );
}
