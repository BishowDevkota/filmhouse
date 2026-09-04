import Image from "next/image";
import Link from "next/link";
import type { CardItem } from "@/lib/tmdb";

/** Links to /{category}/{id}, e.g. /movies/1061474 or /hindi-movies/447362. */
export default function MediaCard({ item }: { item: CardItem }) {
  return (
    <Link
      href={`/${item.category}/${item.id}`}
      className="group relative w-44 flex-none text-left transition-transform duration-300 ease-out hover:z-30 hover:scale-110 focus-visible:z-30 focus-visible:scale-110 focus:outline-none sm:w-56 md:w-64"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded bg-neutral-800 ring-brand transition group-hover:ring-2 group-focus-visible:ring-2">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 176px, (max-width: 768px) 224px, 256px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-neutral-500">
            {item.title}
          </div>
        )}

        {/* Netflix-style detail panel, revealed on hover. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <p className="truncate text-sm font-semibold">{item.title}</p>
          <p className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-300">
            {item.rating ? (
              <span className="font-semibold text-brand-bright">
                {item.rating}% match
              </span>
            ) : null}
            {item.year ? <span>{item.year}</span> : null}
            <span className="tracking-wide text-neutral-400 uppercase">
              {item.mediaType === "tv" ? "Series" : "Film"}
            </span>
          </p>
        </div>
      </div>
    </Link>
  );
}
