/**
 * POST /api/resolve
 *
 * Body: `{ "url": "https://example.com/embed/123", "refresh": false }`
 *
 * The `url` field also accepts a pasted `<iframe>` tag, so the API behaves like
 * the input field in the UI.
 *
 * Responses always match the `ResolveResult` shape. Nothing internal — stack
 * traces, the specific SSRF rule that matched, upstream error text — is ever
 * included; that detail goes to the server log only.
 */

import type { NextRequest } from "next/server";

import { config } from "@/lib/config";
import { ResolverError, toResolverError } from "@/lib/resolver/errors";
import { resolveEmbed } from "@/lib/resolver";
import { parseResolveRequest } from "@/lib/security/url-validation";
import { RateLimiter } from "@/lib/utils/rate-limit";
import { clientAddress } from "@/lib/utils/headers";
import { createLogger } from "@/lib/utils/logger";
import type { ResolveErrorCode, ResolveResult } from "@/types/video";

/** Node APIs (DNS lookups for the SSRF checks) are required. */
export const runtime = "nodejs";

const limiter = new RateLimiter({
  limit: config.rateLimitRequests,
  windowSeconds: config.rateLimitWindowSeconds,
});

const log = createLogger("api.resolve");

/**
 * HTTP status for each failure mode. The request itself was well-formed in the
 * 4xx-but-not-400 cases; the resolution is what could not be completed.
 */
const STATUS_BY_CODE: Record<ResolveErrorCode, number> = {
  invalid_request: 400,
  invalid_url: 400,
  blocked_url: 403,
  rate_limited: 429,
  unsupported_provider: 422,
  no_source: 422,
  timeout: 504,
  network_error: 502,
  provider_failure: 502,
};

function json(body: ResolveResult, status: number, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      // Resolved sources can be signed and short-lived; never let a shared
      // cache hold on to them.
      "Cache-Control": "no-store, private",
      ...headers,
    },
  });
}

function failure(originalUrl: string, error: ResolverError, headers: HeadersInit = {}): Response {
  return json(
    {
      success: false,
      originalUrl,
      sources: [],
      error: error.publicMessage,
      errorCode: error.code,
    },
    STATUS_BY_CODE[error.code] ?? 500,
    headers,
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  const address = clientAddress(request.headers);
  const verdict = limiter.check(address);

  const rateHeaders: Record<string, string> = {
    "X-RateLimit-Limit": String(verdict.limit),
    "X-RateLimit-Remaining": String(verdict.remaining),
    "X-RateLimit-Reset": String(Math.ceil(verdict.resetAt / 1000)),
  };

  if (!verdict.allowed) {
    log.warn({
      status: "rate_limited",
      limit: verdict.limit,
      window: config.rateLimitWindowSeconds,
    });
    return failure(
      "",
      new ResolverError("rate_limited", "Too many requests. Please slow down and try again."),
      { ...rateHeaders, "Retry-After": String(verdict.retryAfterSeconds) },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(
      "",
      new ResolverError("invalid_request", "Request body must be valid JSON."),
      rateHeaders,
    );
  }

  let parsed;
  try {
    parsed = parseResolveRequest(body);
  } catch (error) {
    return failure("", toResolverError(error), rateHeaders);
  }

  const result = await resolveEmbed(parsed.url, { refresh: parsed.refresh, logger: log });

  if (result.success) return json(result, 200, rateHeaders);

  return json(result, STATUS_BY_CODE[result.errorCode ?? "provider_failure"] ?? 500, rateHeaders);
}
