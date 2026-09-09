/**
 * URL vocabulary shared by the extractor, the normalizer and the browser.
 *
 * This module is imported from both the server and the client, so it must stay
 * free of `server-only` and of any Node built-in.
 */

import type { StreamType } from "@/types/video";

/** Upper bound on a user-supplied URL, matching the API contract. */
export const MAX_URL_LENGTH = 2048;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  sol: "/",
  colon: ":",
  equals: "=",
};

/**
 * Decode the HTML entities that realistically appear inside an attribute or an
 * inline script (`&amp;` in a query string is by far the most common).
 */
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Undo JavaScript/JSON string escaping. Player configs are routinely embedded as
 * JSON inside a script tag, which turns `https://a/b.m3u8` into
 * `https:\/\/a\/b.m3u8` or `https://a/b.m3u8`.
 */
export function unescapeJsString(input: string): string {
  return input
    .replace(/\\u([0-9a-fA-F]{4})/g, (match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : match;
    })
    .replace(/\\x([0-9a-fA-F]{2})/g, (match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : match;
    })
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

/**
 * Run every decoding pass a scraped candidate may need. Applied repeatedly
 * because double-encoding (`&amp;amp;`) is common in generated markup.
 */
export function decodeCandidate(raw: string): string {
  let current = raw.trim();
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decodeHtmlEntities(unescapeJsString(current)).trim();
    if (next === current) break;
    current = next;
  }
  return current;
}

/** Strip wrapping quotes, trailing punctuation and whitespace from a scrape. */
export function trimCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/^['"`(\[]+/, "")
    .replace(/['"`)\],;]+$/, "")
    .trim();
}

/**
 * Resolve a candidate against the page it was found on. Handles absolute,
 * protocol-relative (`//cdn/x.m3u8`) and root/document-relative forms.
 *
 * Returns `null` for anything that is not an `http(s)` URL, which also filters
 * out `data:`, `blob:` and `javascript:` candidates.
 */
export function toAbsoluteUrl(candidate: string, base: string | URL): URL | null {
  const cleaned = trimCandidate(decodeCandidate(candidate));
  if (!cleaned) return null;

  const baseUrl = typeof base === "string" ? safeParseUrl(base) : base;

  try {
    // `new URL` handles protocol-relative and relative forms once given a base.
    const resolved = baseUrl ? new URL(cleaned, baseUrl) : new URL(cleaned);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    resolved.hash = "";
    return resolved;
  } catch {
    return null;
  }
}

export function safeParseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Lowercase file extension of the URL path, without the dot. */
export function extensionOf(url: URL): string {
  const lastSegment = url.pathname.split("/").pop() ?? "";
  const dot = lastSegment.lastIndexOf(".");
  if (dot === -1 || dot === lastSegment.length - 1) return "";
  return lastSegment.slice(dot + 1).toLowerCase();
}

const EXTENSION_TYPES: Record<string, StreamType> = {
  m3u8: "hls",
  m3u: "hls",
  mp4: "mp4",
  m4v: "mp4",
  webm: "webm",
  mpd: "dash",
};

/**
 * Infer the stream type from the URL path. Query strings are ignored so that
 * signed URLs (`master.m3u8?token=...`) still classify correctly.
 */
export function streamTypeForUrl(url: URL): StreamType | null {
  const byExtension = EXTENSION_TYPES[extensionOf(url)];
  if (byExtension) return byExtension;

  // Extension-less manifests still tend to name the format in the path.
  const path = url.pathname.toLowerCase();
  if (path.endsWith("/master") || path.includes(".m3u8")) return "hls";
  if (path.includes(".mpd")) return "dash";
  return null;
}

const MIME_TYPES: Record<StreamType, string> = {
  hls: "application/vnd.apple.mpegurl",
  mp4: "video/mp4",
  webm: "video/webm",
  dash: "application/dash+xml",
};

export function mimeTypeFor(type: StreamType): string {
  return MIME_TYPES[type];
}

/** Map a pixel height onto the label people expect to see in a menu. */
export function qualityLabelForHeight(height: number): string {
  if (height >= 4320) return "4320p";
  if (height >= 2160) return "2160p";
  if (height >= 1440) return "1440p";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 480) return "480p";
  if (height >= 360) return "360p";
  if (height >= 240) return "240p";
  return `${height}p`;
}

/** Parse `1080p`, `1080`, `hd1080` and friends back into a pixel height. */
export function heightFromQualityLabel(label: string): number | undefined {
  const match = /(\d{3,4})\s*p?$/.exec(label.trim().toLowerCase());
  if (!match) return undefined;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value >= 100 && value <= 10000 ? value : undefined;
}

/**
 * Query parameters that frequently carry a credential. Their values are masked
 * before a URL reaches a log line.
 */
const SENSITIVE_PARAMS = [
  "token",
  "access_token",
  "auth",
  "authorization",
  "sig",
  "signature",
  "hmac",
  "key",
  "keyid",
  "apikey",
  "api_key",
  "secret",
  "password",
  "pwd",
  "session",
  "sessionid",
  "jwt",
  "policy",
  "expires",
  "hdnts",
  "hdntl",
  "md5",
  "x-amz-signature",
  "x-amz-credential",
  "x-amz-security-token",
  "keypairid",
];

/**
 * Render a URL for logging: credentials dropped, sensitive query values masked,
 * and the whole thing truncated. Never log a raw media URL — signed CDN links
 * are bearer credentials.
 */
export function sanitizeUrlForLog(input: string | URL): string {
  const url = typeof input === "string" ? safeParseUrl(input) : input;
  if (!url) return "<invalid-url>";

  const copy = new URL(url.toString());
  copy.username = "";
  copy.password = "";
  copy.hash = "";

  for (const name of [...copy.searchParams.keys()]) {
    if (SENSITIVE_PARAMS.includes(name.toLowerCase())) {
      // Plain text: `URLSearchParams` would percent-encode brackets.
      copy.searchParams.set(name, "redacted");
    }
  }

  const rendered = copy.toString();
  return rendered.length > 300 ? `${rendered.slice(0, 300)}…` : rendered;
}

/**
 * Canonical form used as a cache key: lowercase host, no fragment, sorted query.
 * Two spellings of the same embed should collapse onto one cache entry.
 */
export function canonicalizeUrl(url: URL): string {
  const copy = new URL(url.toString());
  copy.hash = "";
  copy.hostname = copy.hostname.toLowerCase();
  copy.searchParams.sort();
  if (
    (copy.protocol === "http:" && copy.port === "80") ||
    (copy.protocol === "https:" && copy.port === "443")
  ) {
    copy.port = "";
  }
  return copy.toString();
}
