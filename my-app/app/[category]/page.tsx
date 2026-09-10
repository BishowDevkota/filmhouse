import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Row from "@/components/Row";
import SetupNotice from "@/components/SetupNotice";
import { RowSkeleton } from "@/components/Skeletons";
import { CATEGORIES, getCategory, hasTmdbToken } from "@/lib/tmdb";
import { SITE_NAME, breadcrumbLd, jsonLd } from "@/lib/site";

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[category]">): Promise<Metadata> {
  const { category } = await params;
  const config = getCategory(category);
  if (!config) return { title: "Not found", robots: { index: false } };

  const title = `${config.label} — Watch Free Online`;
  const description = `Browse ${config.label.toLowerCase()} on ${SITE_NAME} — trending, popular and top rated picks, with trailers, cast and streaming servers.`;

  return {
    title,
    description,
    alternates: { canonical: `/${config.slug}` },
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description,
      url: `/${config.slug}`,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CategoryPage({
  params,
}: PageProps<"/[category]">) {
  const { category: slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();
  if (!hasTmdbToken()) return <SetupNotice />;

  const crumbs = breadcrumbLd([
    { name: "Home", path: "/" },
    { name: category.label, path: `/${category.slug}` },
  ]);

  return (
    <div className="pt-24 pb-8 md:pt-28">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(crumbs)} />

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
