/**
 * The only way this application makes an outbound request.
 *
 * Redirects are followed by hand rather than by the runtime, because each hop
 * is a fresh SSRF decision: a public URL that 302s to `http://169.254.169.254/`
 * must not be followed. Every hop is re-validated, the hop count is bounded,
 * the whole chain shares one timeout, and the response body is read through a
 * byte cap so a huge or endless body cannot exhaust memory.
 */

import "server-only";

import { config } from "@/lib/config";
import { ResolverError } from "@/lib/resolver/errors";
import { checkDomainPolicy } from "@/lib/security/domain-policy";
import { checkHost } from "@/lib/security/ssrf";
import { sanitizeUrlForLog } from "@/lib/utils/urls";
import type { Logger } from "@/lib/utils/logger";

export interface SafeFetchOptions {
  headers?: Headers | Record<string, string>;
  /** Overall budget for the whole redirect chain. Defaults to the configured timeout. */
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  /** Caller-side cancellation, combined with the timeout. */
  signal?: AbortSignal;
  method?: "GET" | "HEAD";
  logger?: Logger;
  /**
   * Apply the configured host allowlist to this request. True for the entry
   * URL; false for redirect hops and provider API calls, which are still
   * subject to the denylist and to every SSRF rule.
   */
  enforceAllowlist?: boolean;
}

export interface SafeFetchResult {
  /** URL of the final hop, after redirects. */
  url: URL;
  status: number;
  headers: Headers;
  contentType: string;
  body: string;
  /** True when the byte cap cut the body short. */
  truncated: boolean;
  redirects: number;
}

/** Decode a body with the charset the server declared, falling back to UTF-8. */
function decodeBody(bytes: Uint8Array, contentType: string): string {
  const match = /charset=["']?([\w-]+)/i.exec(contentType);
  const label = match?.[1]?.toLowerCase();

  if (label && label !== "utf-8" && label !== "utf8") {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // Unknown label: fall through to UTF-8.
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/** Read a response body, stopping once `maxBytes` have been buffered. */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!response.body) return { bytes: new Uint8Array(0), truncated: false };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      if (total + value.byteLength > maxBytes) {
        chunks.push(value.subarray(0, maxBytes - total));
        total = maxBytes;
        truncated = true;
        break;
      }

      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
}

/**
 * Validate one destination before a connection is opened. Throws a
 * `blocked_url` ResolverError when the destination is refused.
 */
export async function assertFetchable(url: URL, enforceAllowlist: boolean): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ResolverError("blocked_url", "Only http and https URLs can be fetched.");
  }

  // Credentials in the URL are never forwarded and usually signal an attempt to
  // confuse the parser about which host is really being contacted.
  if (url.username || url.password) {
    throw new ResolverError("blocked_url", "URLs with embedded credentials are not accepted.");
  }

  const policy = checkDomainPolicy(
    url.hostname,
    enforceAllowlist ? undefined : { allowedHosts: [] },
  );
  if (!policy.allowed) {
    throw new ResolverError(
      "blocked_url",
      policy.reason === "denylisted"
        ? "This deployment does not resolve embeds from that host."
        : "This deployment is not configured to resolve embeds from that host.",
      policy.reason,
    );
  }

  const verdict = await checkHost(url.hostname, {
    allowPrivateNetwork: config.allowPrivateNetwork,
    // Keep name resolution inside the request's own budget.
    lookupTimeoutMs: Math.min(config.timeoutMs, 5_000),
  });
  if (!verdict.allowed) {
    // A name that does not resolve is a reachability problem, not a policy
    // refusal — reporting it as "blocked" would misdescribe a simple typo.
    // Either way no connection is opened.
    const unreachable = verdict.reason === "dns_failure" || verdict.reason === "unresolvable";
    throw new ResolverError(
      unreachable ? "network_error" : "blocked_url",
      unreachable ? "That hostname could not be resolved." : "That address cannot be fetched.",
      `${verdict.reason}:${verdict.subject ?? url.hostname}`,
    );
  }
}

/**
 * Fetch a URL with SSRF, redirect, timeout and size limits enforced.
 */
export async function safeFetch(
  target: URL,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const {
    timeoutMs = config.timeoutMs,
    maxRedirects = config.maxRedirects,
    maxBytes = config.maxHtmlBytes,
    method = "GET",
    enforceAllowlist = false,
    logger,
  } = options;

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([timeoutSignal, options.signal]) : timeoutSignal;

  let current = new URL(target.toString());
  let redirects = 0;

  for (;;) {
    // Only the entry URL is subject to the allowlist; every hop is subject to
    // the denylist and to the full SSRF check.
    await assertFetchable(current, enforceAllowlist && redirects === 0);

    let response: Response;
    try {
      response = await fetch(current, {
        method,
        headers: options.headers,
        redirect: "manual",
        signal,
        cache: "no-store",
      });
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "TimeoutError")) {
        throw new ResolverError("timeout", "The provider took too long to respond.");
      }
      throw new ResolverError(
        "network_error",
        "Unable to reach the embed provider.",
        error instanceof Error ? error.message : String(error),
      );
    }

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get("location");

    if (isRedirect && location) {
      await response.body?.cancel().catch(() => {});

      if (redirects >= maxRedirects) {
        throw new ResolverError("network_error", "The provider redirected too many times.");
      }

      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new ResolverError("network_error", "The provider sent an invalid redirect.");
      }

      logger?.debug({
        event: "redirect",
        from: sanitizeUrlForLog(current),
        to: sanitizeUrlForLog(next),
        status: response.status,
      });

      current = next;
      redirects += 1;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new ResolverError(
        response.status === 404 ? "no_source" : "network_error",
        `The provider responded with HTTP ${response.status}.`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    const { bytes, truncated } = await readCapped(response, maxBytes);

    return {
      url: current,
      status: response.status,
      headers: response.headers,
      contentType,
      body: decodeBody(bytes, contentType),
      truncated,
      redirects,
    };
  }
}

/** `safeFetch` plus JSON parsing, for providers that use a documented API. */
export async function safeFetchJson<T>(target: URL, options: SafeFetchOptions = {}): Promise<T> {
  const result = await safeFetch(target, options);
  if (result.truncated) {
    throw new ResolverError("provider_failure", "The provider returned an oversized response.");
  }
  try {
    return JSON.parse(result.body) as T;
  } catch {
    throw new ResolverError("provider_failure", "The provider returned malformed JSON.");
  }
}
