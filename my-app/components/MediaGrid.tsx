import MediaCard from "@/components/MediaCard";
import type { CardItem } from "@/lib/tmdb";

/** Search results and "More Like This" read better as a wrapping grid. */
export default function MediaGrid({
  title,
  items,
}: {
  title: string;
  items: CardItem[];
}) {
  return (
    <section className="px-4 md:px-12">
      <h2 className="mb-6 text-xl font-semibold text-neutral-200 md:text-2xl">
        {title}
      </h2>
      <div className="flex flex-wrap gap-x-2 gap-y-6">
        {items.map((item) => (
          <MediaCard key={`${item.category}-${item.id}`} item={item} />
        ))}
      </div>
    </section>
  );
}
