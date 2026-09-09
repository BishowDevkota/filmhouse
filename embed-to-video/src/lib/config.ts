/**
 * Runtime configuration, read once from the environment.
 *
 * Server-only. Every value has a safe default so the app boots with no `.env`.
 */

import "server-only";

function int(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

function list(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  /** Wall-clock budget for a single outbound fetch. */
  timeoutMs: int("RESOLVER_TIMEOUT_MS", 10_000, 1_000, 60_000),
  /** Redirect hops followed while resolving an embed. */
  maxRedirects: int("MAX_REDIRECTS", 5, 0, 10),
  /** Cap on the embed HTML we will buffer, in bytes. */
  maxHtmlBytes: int("MAX_HTML_BYTES", 3_000_000, 10_000, 20_000_000),
  cacheTtlSeconds: int("CACHE_TTL_SECONDS", 300, 0, 3_600),
  cacheMaxEntries: int("CACHE_MAX_ENTRIES", 500, 10, 10_000),
  rateLimitRequests: int("RATE_LIMIT_REQUESTS", 30, 1, 10_000),
  rateLimitWindowSeconds: int("RATE_LIMIT_WINDOW_SECONDS", 60, 1, 3_600),
  /** Playwright fallback. Off by default; see README. */
  enableBrowserResolver: bool("ENABLE_BROWSER_RESOLVER", false),
  browserTimeoutMs: int("BROWSER_TIMEOUT_MS", 20_000, 1_000, 60_000),
  /**
   * When non-empty, only these hostnames (or their subdomains) may be resolved.
   * The safest posture for a production deployment.
   */
  allowedHosts: list("ALLOWED_EMBED_HOSTS"),
  /** Always-refused hostnames, on top of the built-in policy denylist. */
  blockedHosts: list("BLOCKED_EMBED_HOSTS"),
  /** Allow resolving to private/loopback addresses. Never enable in production. */
  allowPrivateNetwork: bool("ALLOW_PRIVATE_NETWORK", false),
  logLevel: (process.env.LOG_LEVEL ?? "info").toLowerCase(),
} as const;

export type AppConfig = typeof config;
