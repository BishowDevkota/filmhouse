import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Row from "@/components/Row";
import SetupNotice from "@/components/SetupNotice";
import { RowSkeleton } from "@/components/Skeletons";
import { CATEGORIES, getCategory, hasTmdbToken } from "@/lib/tmdb";

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[category]">): Promise<Metadata> {
  const { category } = await params;
  const config = getCategory(category);
  return { title: config ? `${config.label} — Filmhouse TV` : "Not found" };
}

export default async function CategoryPage({
  params,
}: PageProps<"/[category]">) {
  const { category: slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();
  if (!hasTmdbToken()) return <SetupNotice />;

  return (
    <div className="pt-24 pb-8 md:pt-28">
      <h1 className="mb-4 px-4 text-2xl font-bold md:px-12 md:text-3xl">
        {category.label}
      </h1>
      <div className="space-y-2">
        {category.rows.map((row) => (
          <Suspense key={row.id} fallback={<RowSkeleton title={row.title} />}>
            <Row row={row} />
          </Suspense>
        ))}
      </div>
    </div>
  );
}
