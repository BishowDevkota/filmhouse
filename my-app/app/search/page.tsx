import { Suspense } from "react";
import MediaGrid from "@/components/MediaGrid";
import SetupNotice from "@/components/SetupNotice";
import { GridSkeleton } from "@/components/Skeletons";
import { hasTmdbToken, search, toCardItem } from "@/lib/tmdb";

async function Results({ query }: { query: string }) {
  if (!query) {
    return (
      <p className="px-4 text-neutral-400 md:px-12">
        Type something in the search box to find titles.
      </p>
    );
  }

  let items;
  try {
    items = await search(query);
  } catch (error) {
    console.error("Search failed", error);
    return (
      <p className="px-4 text-neutral-400 md:px-12">
        Search is unavailable right now. Please try again.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="px-4 text-neutral-400 md:px-12">
        No results for <span className="text-white">{query}</span>.
      </p>
    );
  }

  return (
    <MediaGrid title={`Results for "${query}"`} items={items.map(toCardItem)} />
  );
}

export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  if (!hasTmdbToken()) return <SetupNotice />;

  const params = await searchParams;
  const raw = params.q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  return (
    <div className="pt-24 pb-8 md:pt-28">
      <Suspense key={query} fallback={<GridSkeleton title="Searching…" />}>
        <Results query={query} />
      </Suspense>
    </div>
  );
}
