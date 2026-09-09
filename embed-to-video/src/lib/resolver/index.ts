/**
 * The resolution pipeline.
 *
 *   validate URL → check cache → detect provider → run provider →
 *   normalize sources → (fall back to generic) → cache → ResolveResult
 *
 * This function never throws. Every failure — bad input, a blocked address, a
 * provider that fell over — comes back as a `ResolveResult` with `success:
 * false` and a `ResolveErrorCode`, so one broken provider can never take down
 * the route handler.
 */

import "server-only";

import { config } from "@/lib/config";
import { resolveWithBrowser } from "@/lib/extraction/browser";
import { ResolverError, toResolverError } from "@/lib/resolver/errors";
import { detectProvider } from "@/lib/resolver/detector";
import { normalizeSources } from "@/lib/resolver/normalizer";
import { genericProvider } from "@/lib/resolver/registry";
import type { ProviderPayload, ResolveContext, VideoProvider } from "@/lib/resolver/types";
import { safeFetch, safeFetchJson } from "@/lib/security/safe-fetch";
import { validateEmbedUrl } from "@/lib/security/url-validation";
import { TtlCache } from "@/lib/utils/cache";
import { createLogger, type Logger } from "@/lib/utils/logger";
import { canonicalizeUrl, sanitizeUrlForLog } from "@/lib/utils/urls";
import type { ResolveErrorCode, ResolveResult } from "@/types/video";

/**
 * Resolved sources, cached briefly. Signed CDN URLs expire, so the TTL is short
 * by default and nothing is written to disk.
 */
const resolveCache = new TtlCache<ResolveResult>({
  ttlSeconds: config.cacheTtlSeconds,
  maxEntries: config.cacheMaxEntries,
});

/** Exposed for tests and for an operator-triggered flush. */
export function clearResolveCache(): void {
  resolveCache.clear();
}

/**
 * Total budget for one resolution. Individual requests each get
 * `RESOLVER_TIMEOUT_MS`; this bounds the sum so a page plus its playlist probes
 * cannot stack up into an unbounded request.
 */
function resolutionBudgetMs(): number {
  return config.timeoutMs * 2;
}

/**
 * Failures that describe the URL itself rather than one adapter's attempt at
 * it. Retrying through the generic scanner would produce the same refusal.
 */
const TERMINAL_CODES = new Set<ResolveErrorCode>(["blocked_url", "invalid_url", "rate_limited"]);

function createContext(logger: Logger, signal: AbortSignal): ResolveContext {
  return {
    logger,
    signal,
    fetchText: (url, options = {}) => safeFetch(url, { logger, signal, ...options }),
    fetchJson: (url, options = {}) => safeFetchJson(url, { logger, signal, ...options }),
    renderInBrowser: (url) => resolveWithBrowser(url, logger),
  };
}

export interface ResolveOptions {
  /** Skip the cache for this call. */
  refresh?: boolean;
  logger?: Logger;
}

/** Run one provider and normalize whatever it produced. */
async function runProvider(
  provider: VideoProvider,
  url: URL,
  context: ResolveContext,
): Promise<{ payload: ProviderPayload; sources: ResolveResult["sources"] }> {
  const payload = await provider.resolve(url, context);
  const sources = normalizeSources(payload.sources ?? [], payload.baseUrl ?? url.toString());
  return { payload, sources };
}

/**
 * Resolve an embed URL (or a pasted `<iframe>` tag) into playable sources.
 */
export async function resolveEmbed(
  input: string,
  options: ResolveOptions = {},
): Promise<ResolveResult> {
  const startedAt = Date.now();
  const log = options.logger ?? createLogger("resolver");

  // Best-effort echo of the caller's input, so a failure result still says what
  // was asked for without ever reflecting an unsanitized string.
  let originalUrl = "";

  try {
    const url = validateEmbedUrl(input);
    originalUrl = url.toString();

    const cacheKey = canonicalizeUrl(url);
    if (!options.refresh) {
      const cached = resolveCache.get(cacheKey);
      if (cached) {
        log.info({
          provider: cached.provider ?? "unknown",
          url: sanitizeUrlForLog(url),
          status: "cached",
          sources: cached.sources.length,
          duration: `${Date.now() - startedAt}ms`,
        });
        return cached;
      }
    }

    const provider = detectProvider(url);
    const signal = AbortSignal.timeout(resolutionBudgetMs());
    const context = createContext(log.child("provider", { provider: provider.name }), signal);

    let providerName = provider.name;
    // Held so the specific reason (blocked address, timeout, unreachable host)
    // survives to the response instead of collapsing into a generic failure.
    let providerError: ResolverError | null = null;

    let outcome: Awaited<ReturnType<typeof runProvider>> | null = null;
    try {
      outcome = await runProvider(provider, url, context);
    } catch (error) {
      const resolverError = toResolverError(error);
      // A deliberate refusal is final; anything else may still be worth a
      // generic attempt below.
      if (
        resolverError.code === "unsupported_provider" &&
        provider.allowGenericFallback === false
      ) {
        throw resolverError;
      }
      providerError = resolverError;
      log.warn({
        provider: provider.name,
        url: sanitizeUrlForLog(url),
        status: "provider_error",
        code: resolverError.code,
        detail: resolverError.detail ?? resolverError.publicMessage,
      });
    }

    // A specific adapter that found nothing gets one fallback to the generic
    // scanner — unless it opted out, or the URL itself was refused, in which
    // case a second attempt would be refused identically.
    if (
      (!outcome || outcome.sources.length === 0) &&
      !(providerError && TERMINAL_CODES.has(providerError.code)) &&
      provider !== genericProvider &&
      provider.allowGenericFallback !== false
    ) {
      log.debug({ event: "generic_fallback", from: provider.name });
      const fallback = await runProvider(genericProvider, url, context).catch(() => null);
      if (fallback && fallback.sources.length > 0) {
        outcome = fallback;
        providerName = genericProvider.name;
        providerError = null;
      }
    }

    if (!outcome) {
      throw providerError ?? new ResolverError("provider_failure", "Provider resolution failed.");
    }

    if (outcome.sources.length === 0) {
      throw new ResolverError("no_source", "No authorized playable source was found.");
    }

    const result: ResolveResult = {
      success: true,
      provider: providerName,
      originalUrl,
      sources: outcome.sources,
      title: outcome.payload.title,
      thumbnail: outcome.payload.thumbnail,
      duration: outcome.payload.duration,
    };

    resolveCache.set(cacheKey, result);

    log.info({
      provider: providerName,
      url: sanitizeUrlForLog(url),
      status: "success",
      sources: result.sources.length,
      type: result.sources[0]?.type,
      duration: `${Date.now() - startedAt}ms`,
    });

    return result;
  } catch (error) {
    const resolverError = toResolverError(error);

    log.warn({
      provider: "none",
      url: originalUrl ? sanitizeUrlForLog(originalUrl) : "<unparsed>",
      status: "failure",
      code: resolverError.code,
      // `detail` is server-side only and never reaches the response body.
      detail: resolverError.detail ?? resolverError.publicMessage,
      duration: `${Date.now() - startedAt}ms`,
    });

    return {
      success: false,
      originalUrl,
      sources: [],
      error: resolverError.publicMessage,
      errorCode: resolverError.code,
    };
  }
}
