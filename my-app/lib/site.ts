/**
 * Brand identity and canonical-URL helpers.
 *
 * Every <title>, canonical link, Open Graph tag, sitemap entry and JSON-LD
 * node reads the name and origin from here, so a rename or a domain move is a
 * one-file change instead of a grep across the whole app.
 */

export const SITE_NAME = "Hatti TV";
export const SITE_TAGLINE = "Movies, TV Shows, Anime & Live Sports";

export const SITE_DESCRIPTION =
  "Watch movies, TV shows, anime, Hindi cinema and live sports on Hatti TV. " +
  "Trailers, cast, ratings and multiple streaming servers — free, no signup.";

/**
 * The production origin. Set NEXT_PUBLIC_SITE_URL on the host to point a
 * preview or a new domain somewhere else; the trailing slash is stripped so
 * `${SITE_URL}${path}` never produces a double slash.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://hattitv.com"
).replace(/\/+$/, "");

/** A path ("/movies") turned into the absolute URL crawlers want to see. */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Social profiles, in one place so the footer's icon row and the Organization
 * JSON-LD `sameAs` list can never drift apart.
 */
export const SOCIAL_LINKS = [
  {
    name: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61594290800728",
  },
  { name: "Instagram", href: "https://www.instagram.com/filmhousetv/" },
  { name: "TikTok", href: "https://www.tiktok.com/@filmhousetiktok" },
  { name: "YouTube", href: "https://www.youtube.com/@film_house_tv" },
] as const;

/**
 * Props for a JSON-LD <script>.
 *
 * JSON.stringify does not escape "<", so an overview containing "</script>"
 * would close the tag early and turn the payload into markup. Escaping it to
 * a \u003c sequence keeps the JSON valid and the string inert.
 */
export function jsonLd(data: object): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}

/** Schema.org BreadcrumbList from an ordered list of crumbs. */
export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
