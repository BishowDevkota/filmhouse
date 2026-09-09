/**
 * Request-shape and URL validation for the public API.
 *
 * Everything here is synchronous and side-effect free — it is the cheap gate in
 * front of the expensive, network-touching checks in `safe-fetch.ts`.
 */

import "server-only";

import { z } from "zod";

import { ResolverError } from "@/lib/resolver/errors";
import { checkDomainPolicy } from "@/lib/security/domain-policy";
import { classifyHostname, classifyIpLiteral } from "@/lib/security/ssrf";
import { config } from "@/lib/config";
import { parseEmbedInput } from "@/lib/utils/iframe";
import { MAX_URL_LENGTH } from "@/lib/utils/urls";

/**
 * The field is generous enough to hold a pasted `<iframe>` tag; the URL parsed
 * out of it is then held to `MAX_URL_LENGTH`.
 */
const MAX_FIELD_LENGTH = 8192;

export const resolveRequestSchema = z
  .object({
    url: z
      .string({ error: "A url field is required." })
      .min(1, "The url field cannot be empty.")
      .max(MAX_FIELD_LENGTH, "The url field is too long."),
    /**
     * Opt this request out of the resolved-source cache. Ignored unless the
     * cache is enabled.
     */
    refresh: z.boolean().optional(),
  })
  .strict();

export type ResolveRequest = z.infer<typeof resolveRequestSchema>;

/**
 * Parse and validate an untrusted request body.
 *
 * @throws ResolverError with code `invalid_request` when the shape is wrong.
 */
export function parseResolveRequest(body: unknown): ResolveRequest {
  const parsed = resolveRequestSchema.safeParse(body);
  if (parsed.success) return parsed.data;

  const first = parsed.error.issues[0];
  const field = first?.path.join(".") || "body";
  throw new ResolverError(
    "invalid_request",
    `Invalid request: ${first?.message ?? "unrecognized body"}`,
    `${field}: ${first?.code ?? "unknown"}`,
  );
}

/**
 * Turn user input into a URL that is syntactically valid, uses a permitted
 * scheme, is not obviously internal, and passes the deployment's host policy.
 *
 * Accepts a bare URL or a pasted `<iframe>` tag, so the API behaves the same
 * way the input field does.
 *
 * @throws ResolverError with `invalid_url` or `blocked_url`.
 */
export function validateEmbedUrl(input: string): URL {
  const parsed = parseEmbedInput(input);
  if (!parsed.ok) {
    const message =
      parsed.reason === "unsupported_scheme"
        ? "Only http and https URLs can be resolved."
        : parsed.reason === "no_src"
          ? "That iframe tag has no src attribute."
          : "That does not look like a valid embed URL.";
    throw new ResolverError("invalid_url", message, parsed.reason);
  }

  const url = new URL(parsed.url);

  if (url.toString().length > MAX_URL_LENGTH) {
    throw new ResolverError("invalid_url", "That URL is too long to resolve.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ResolverError("invalid_url", "Only http and https URLs can be resolved.");
  }

  if (url.username || url.password) {
    throw new ResolverError(
      "blocked_url",
      "URLs with embedded credentials are not accepted.",
      "credentials_in_url",
    );
  }

  if (!config.allowPrivateNetwork) {
    // Cheap, synchronous rejections. The authoritative check, including DNS,
    // happens in `safe-fetch.ts` before any connection is opened.
    const literal = classifyIpLiteral(url.hostname.replace(/^\[|\]$/g, ""));
    if (literal) {
      throw new ResolverError("blocked_url", "That address cannot be resolved.", literal);
    }
    if (literal === undefined) {
      const byName = classifyHostname(url.hostname);
      if (byName) {
        throw new ResolverError("blocked_url", "That address cannot be resolved.", byName);
      }
    }
  }

  const policy = checkDomainPolicy(url.hostname);
  if (!policy.allowed) {
    throw new ResolverError(
      "blocked_url",
      policy.reason === "denylisted"
        ? "This deployment does not resolve embeds from that host."
        : "This deployment is not configured to resolve embeds from that host.",
      policy.reason,
    );
  }

  return url;
}
