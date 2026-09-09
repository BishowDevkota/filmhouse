/**
 * Outbound request headers, and the client-address logic used for rate limiting.
 */

import "server-only";

/**
 * Headers sent when fetching an embed page.
 *
 * The User-Agent identifies this tool honestly rather than impersonating a
 * browser: the goal is to read pages that are meant to be readable, not to slip
 * past bot detection. A site that refuses this agent is telling us not to
 * resolve it, and that answer is respected.
 */
export function embedRequestHeaders(target: URL, referer?: string): Headers {
  const headers = new Headers({
    "User-Agent":
      "EmbedToVideo/1.0 (+authorized embed resolver; https://github.com/embed-to-video)",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  });

  // Some players key their config off the embedding page. Only ever send the
  // embed's own origin, never anything from the incoming request.
  if (referer) headers.set("Referer", referer);
  else headers.set("Referer", target.origin + "/");

  return headers;
}

/** Headers for a provider's JSON API. */
export function apiRequestHeaders(): Headers {
  return new Headers({
    "User-Agent": "EmbedToVideo/1.0 (+authorized embed resolver)",
    Accept: "application/json",
  });
}

/**
 * Best-effort client address for rate limiting.
 *
 * Forwarding headers are trusted only because a Next.js app is normally behind
 * a proxy that sets them. If yours is exposed directly, these are spoofable —
 * see the rate-limiting note in the README.
 */
export function clientAddress(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim() || "unknown";
}
