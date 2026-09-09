/**
 * The contract every provider adapter implements.
 *
 * A provider's job is narrow: given an embed URL, produce candidate media URLs
 * and whatever metadata it happens to know. It does not normalize, deduplicate,
 * validate or shape the API response — the resolver pipeline does all of that,
 * so every provider gets the same treatment.
 */

import type { ProviderInfo, StreamType } from "@/types/video";
import type { SafeFetchOptions, SafeFetchResult } from "@/lib/security/safe-fetch";
import type { Logger } from "@/lib/utils/logger";

/**
 * A media URL as found, before normalization. The URL may still be relative,
 * protocol-relative, HTML-escaped or JSON-escaped; the normalizer cleans it up.
 */
export interface RawSource {
  url: string;
  /** Set when the provider knows the format; otherwise inferred from the URL. */
  type?: StreamType;
  mimeType?: string;
  quality?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  language?: string;
  headers?: Record<string, string>;
  /** True for a manifest that already contains every variant (HLS master, DASH MPD). */
  isMaster?: boolean;
}

/** What a provider returns on success. */
export interface ProviderPayload {
  sources: RawSource[];
  title?: string;
  thumbnail?: string;
  /** Seconds. */
  duration?: number;
  /**
   * Base for resolving relative source URLs. Defaults to the embed URL, but a
   * provider that followed redirects should pass the URL it actually landed on.
   */
  baseUrl?: string;
}

/**
 * Services handed to a provider. Injecting these keeps providers free of direct
 * network access, which is what makes them both SSRF-safe and unit-testable:
 * every outbound request goes through the checked fetcher.
 */
export interface ResolveContext {
  logger: Logger;
  signal?: AbortSignal;
  /** Fetch a document with SSRF, redirect, timeout and size limits applied. */
  fetchText(url: URL, options?: SafeFetchOptions): Promise<SafeFetchResult>;
  /** Fetch and parse JSON from a provider's documented API. */
  fetchJson<T>(url: URL, options?: SafeFetchOptions): Promise<T>;
  /**
   * Render the page in a headless browser and report media requests. Returns
   * `null` unless `ENABLE_BROWSER_RESOLVER` is on and Playwright is installed.
   */
  renderInBrowser(url: URL): Promise<ProviderPayload | null>;
}

export interface VideoProvider {
  /** Stable identifier reported to the client. */
  name: string;
  /** Documentation surfaced by `GET /api/providers`. */
  info: ProviderInfo;
  /**
   * Whether the generic scanner may be tried when this provider finds nothing.
   * Defaults to true. `RestrictedProvider` sets it to false so a deliberate
   * refusal is never quietly worked around.
   */
  allowGenericFallback?: boolean;
  /** Deterministic match on the URL alone — no network access here. */
  canHandle(url: URL): boolean;
  resolve(url: URL, context: ResolveContext): Promise<ProviderPayload>;
}
