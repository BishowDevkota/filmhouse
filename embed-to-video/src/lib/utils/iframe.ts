/**
 * Turn whatever the user pasted into a candidate embed URL.
 *
 * People paste one of three things: a bare URL, a full `<iframe …>` tag copied
 * from a "share" dialog, or a block of prose with a tag somewhere inside it.
 * This module is client-safe and does no network work — it only parses.
 */

import { MAX_URL_LENGTH, decodeHtmlEntities, safeParseUrl } from "@/lib/utils/urls";

/** Guard against pathological input before any regex runs. */
const MAX_INPUT_LENGTH = 100_000;

export type ParsedEmbedInput =
  { ok: true; url: string; source: "iframe" | "url" } | { ok: false; reason: ParseFailure };

export type ParseFailure = "empty" | "too_long" | "no_src" | "invalid_url" | "unsupported_scheme";

/**
 * `src` (or `data-src`, used by lazy-loading embeds) from the first iframe in
 * the input. Attribute values may be double-quoted, single-quoted or bare.
 */
function findIframeSrc(input: string): { value: string | null; sawIframe: boolean } {
  const iframeTag = /<iframe\b[^>]*>/i.exec(input);
  if (!iframeTag) return { value: null, sawIframe: false };

  const tag = iframeTag[0];
  const attribute = /\b(?:data-)?src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(tag);
  if (!attribute) return { value: null, sawIframe: true };

  const value = attribute[1] ?? attribute[2] ?? attribute[3] ?? "";
  return { value: value.trim() || null, sawIframe: true };
}

/** A dotted name, an IP literal, or `localhost` — anything else is a typo. */
function isPlausibleHost(hostname: string): boolean {
  if (hostname.includes(".")) return true;
  if (hostname === "localhost") return true;
  return /^\[[0-9a-fA-F:.]+\]$/.test(hostname);
}

/**
 * Accept the shorthand people actually type. A bare `example.com/embed/1` is
 * upgraded to `https://`; a protocol-relative `//host/x` keeps the page's
 * scheme. Anything that is not http(s) after that is rejected rather than
 * coerced, so `javascript:` and `data:` never survive.
 */
function coerceToUrl(raw: string): ParsedEmbedInput {
  const decoded = decodeHtmlEntities(raw).trim().replace(/^<|>$/g, "").trim();
  if (!decoded) return { ok: false, reason: "empty" };

  const hadScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded);
  const withScheme = decoded.startsWith("//")
    ? `https:${decoded}`
    : hadScheme
      ? decoded
      : `https://${decoded}`;

  const parsed = safeParseUrl(withScheme);
  if (!parsed) return { ok: false, reason: "invalid_url" };
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "unsupported_scheme" };
  }
  if (!parsed.hostname) return { ok: false, reason: "invalid_url" };

  // When the scheme was inferred, insist the host looks like one. Otherwise a
  // stray word ("not") silently becomes `https://not/`. An explicit scheme is
  // taken at face value here and judged by the server's host policy instead.
  if (!hadScheme && !isPlausibleHost(parsed.hostname)) {
    return { ok: false, reason: "invalid_url" };
  }
  if (parsed.toString().length > MAX_URL_LENGTH) return { ok: false, reason: "too_long" };

  return { ok: true, url: parsed.toString(), source: "url" };
}

/**
 * Full parse with a machine-readable failure reason, for the input field to
 * render inline feedback.
 */
export function parseEmbedInput(input: string): ParsedEmbedInput {
  if (typeof input !== "string") return { ok: false, reason: "invalid_url" };

  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_INPUT_LENGTH) return { ok: false, reason: "too_long" };

  const { value, sawIframe } = findIframeSrc(trimmed);
  if (sawIframe) {
    if (!value) return { ok: false, reason: "no_src" };
    const parsed = coerceToUrl(value);
    return parsed.ok ? { ...parsed, source: "iframe" } : parsed;
  }

  // Not an iframe: take the first whitespace-delimited token that parses. This
  // tolerates a URL pasted with a trailing note.
  const token = trimmed.split(/\s+/)[0] ?? trimmed;
  return coerceToUrl(token);
}

/**
 * Convenience wrapper: the embed URL, or `null` when the input yields none.
 * Accepts iframe HTML or a direct URL.
 */
export function extractIframeUrl(input: string): string | null {
  const parsed = parseEmbedInput(input);
  return parsed.ok ? parsed.url : null;
}

/** Human-readable copy for each parse failure, used by the input component. */
export const PARSE_FAILURE_MESSAGES: Record<ParseFailure, string> = {
  empty: "Paste an embed URL or an <iframe> tag to begin.",
  too_long: "That input is too long to be an embed URL.",
  no_src: "That <iframe> tag has no src attribute.",
  invalid_url: "That does not look like a valid URL.",
  unsupported_scheme: "Only http and https URLs can be resolved.",
};
