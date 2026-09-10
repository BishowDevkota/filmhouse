import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import { CATEGORIES, getList, hasTmdbToken } from "@/lib/tmdb";
import { getSports } from "@/lib/sports";

/**
 * The catalogue runs to tens of thousands of TMDB ids, so the sitemap does not
 * try to list all of them. It publishes the stable browse routes plus the
 * currently popular titles in each category — the pages worth crawling today —
 * so new releases get discovered without a redeploy.
 *
 * Next takes the *lowest* revalidate between this route and the fetches inside
 * it, so the live sports schedule (120s) is what actually paces regeneration.
 * The day here is the ceiling, not the observed interval.
 */
export const revalidate = 86400;

/** How many titles per category to advertise. */
const TITLES_PER_CATEGORY = 20;

/** A failed TMDB call must not take the whole sitemap down with it. */
async function safeList(path: string, params?: Record<string, string>) {
  try {
    return await getList(path, params);
  } catch (error) {
    console.error(`Sitemap: failed to list ${path}`, error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/sports"),
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    ...CATEGORIES.map((category) => ({
      url: absoluteUrl(`/${category.slug}`),
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];

  // Sport landing pages change with the fixture list, not with a deploy.
  try {
    const sports = await getSports();
    entries.push(
      ...sports.map((sport) => ({
        url: absoluteUrl(`/sports/${sport.id}`),
        lastModified: now,
        changeFrequency: "hourly" as const,
        priority: 0.6,
      })),
    );
  } catch (error) {
    console.error("Sitemap: failed to list sports", error);
  }

  // Without a token every TMDB call throws; ship the static routes alone
  // rather than an empty sitemap.
  if (!hasTmdbToken()) return entries;

  const lists = await Promise.all(
    CATEGORIES.map(async (category) => {
      const [first] = category.rows;
      const items = first ? await safeList(first.path, first.params) : [];
      return { category, items: items.slice(0, TITLES_PER_CATEGORY) };
    }),
  );

  for (const { category, items } of lists) {
    for (const item of items) {
      entries.push({
        url: absoluteUrl(`/${category.slug}/${item.id}`),
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  }

  return entries;
}
