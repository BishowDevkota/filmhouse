import RowCarousel from "@/components/RowCarousel";
import { getList, toCardItem, type RowConfig, type TmdbItem } from "@/lib/tmdb";

export default async function Row({ row }: { row: RowConfig }) {
  let items: TmdbItem[] | null = null;
  try {
    items = await getList(row.path, row.params);
  } catch (error) {
    console.error(`Failed to load row "${row.id}"`, error);
  }

  if (!items) {
    return (
      <section className="px-4 py-6 md:px-12">
        <h2 className="mb-1 text-lg font-semibold text-neutral-200 md:text-xl">
          {row.title}
        </h2>
        <p className="text-sm text-neutral-500">
          Couldn&apos;t load this row right now.
        </p>
      </section>
    );
  }

  return <RowCarousel title={row.title} items={items.map(toCardItem)} />;
}
