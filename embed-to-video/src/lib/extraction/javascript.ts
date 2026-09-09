/**
 * Media URLs embedded in JavaScript.
 *
 * Many players ship their configuration as a JSON blob or an object literal
 * inside a `<script>` tag. This module reads those declarations; it does not
 * execute anything, and it does not attempt to defeat obfuscation, DRM or any
 * access control — if a page hides its source behind those, extraction simply
 * fails and the caller falls back.
 */

import "server-only";

import type { RawSource } from "@/lib/resolver/types";
import type { StreamType } from "@/types/video";
import { decodeCandidate } from "@/lib/utils/urls";

/** Absolute or protocol-relative media URLs. */
const ABSOLUTE_MEDIA = new RegExp(
  String.raw`(?:https?:)?\/\/[^\s"'\`<>()\[\]{},;\\]+?\.(?:m3u8|m3u|mp4|m4v|webm|mpd)(?:\?[^\s"'\`<>()\[\]{},;\\]*)?`,
  "gi",
);

/** Root- or document-relative media paths, once absolutes are removed. */
const RELATIVE_MEDIA = new RegExp(
  String.raw`(?:^|["'\`(=,:\s])(\.{0,2}\/[^\s"'\`<>()\[\]{},;\\]*?\.(?:m3u8|m3u|mp4|m4v|webm|mpd)(?:\?[^\s"'\`<>()\[\]{},;\\]*)?)`,
  "gi",
);

/** Small object literals, the unit a player config declares one variant in. */
const OBJECT_LITERAL = /\{[^{}]{0,800}\}/g;

const URL_KEY =
  /["']?(?:file|src|url|source|link|stream|manifest|play_?url|hls|dash)["']?\s*:\s*["']([^"']{4,2000})["']/i;
const LABEL_KEY = /["']?(?:label|quality|resolution|name|title)["']?\s*:\s*["']([^"']{1,40})["']/i;
const HEIGHT_KEY = /["']?(?:height|size|res|verticalResolution)["']?\s*:\s*["']?(\d{2,5})/i;
const WIDTH_KEY = /["']?width["']?\s*:\s*["']?(\d{2,5})/i;
const BITRATE_KEY = /["']?(?:bitrate|bandwidth|tbr|averageBitrate)["']?\s*:\s*["']?(\d{3,12})/i;
const TYPE_KEY = /["']?(?:type|mimeType|mime)["']?\s*:\s*["']([^"']{3,80})["']/i;
const LANGUAGE_KEY = /["']?(?:lang|language|srclang)["']?\s*:\s*["']([a-zA-Z-]{2,12})["']/i;

function typeFromMime(mime: string | undefined): StreamType | undefined {
  if (!mime) return undefined;
  const value = mime.toLowerCase();
  if (value.includes("mpegurl") || value.includes("m3u8") || value === "hls") return "hls";
  if (value.includes("dash") || value.includes("mpd")) return "dash";
  if (value.includes("webm")) return "webm";
  if (value.includes("mp4")) return "mp4";
  return undefined;
}

function toInt(value: string | undefined, max: number): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= max ? parsed : undefined;
}

/**
 * Pull annotated variants out of object literals, so a quality menu can be
 * built from what the page itself declared.
 */
function extractAnnotatedSources(haystack: string): RawSource[] {
  const found: RawSource[] = [];

  for (const match of haystack.matchAll(OBJECT_LITERAL)) {
    const chunk = match[0];
    const urlMatch = URL_KEY.exec(chunk);
    if (!urlMatch) continue;

    const url = urlMatch[1];
    if (!/\.(m3u8|m3u|mp4|m4v|webm|mpd)(\?|#|$)/i.test(url)) continue;

    found.push({
      url,
      type: typeFromMime(TYPE_KEY.exec(chunk)?.[1]),
      quality: LABEL_KEY.exec(chunk)?.[1]?.trim() || undefined,
      height: toInt(HEIGHT_KEY.exec(chunk)?.[1], 16_000),
      width: toInt(WIDTH_KEY.exec(chunk)?.[1], 16_000),
      bitrate: toInt(BITRATE_KEY.exec(chunk)?.[1], 1_000_000_000),
      language: LANGUAGE_KEY.exec(chunk)?.[1] || undefined,
    });
  }

  return found;
}

/**
 * Scan a document for media URLs.
 *
 * The whole document is un-escaped first, which collapses the many spellings a
 * URL can have in generated markup (`https:\/\/…`, `https://…`,
 * `https:&#47;&#47;…`) into one form the regexes can match.
 *
 * Annotated variants are collected first so their quality labels survive
 * deduplication in the normalizer.
 */
export function extractFromJavaScript(text: string): RawSource[] {
  if (!text) return [];

  const haystack = decodeCandidate(text);
  const sources: RawSource[] = [...extractAnnotatedSources(haystack)];

  // Absolute matches first; blank them out so the relative pass cannot rematch
  // a path that is really part of an absolute URL on another host.
  let remainder = haystack;
  for (const match of haystack.matchAll(ABSOLUTE_MEDIA)) {
    sources.push({ url: match[0] });
  }
  remainder = haystack.replace(ABSOLUTE_MEDIA, " ");

  for (const match of remainder.matchAll(RELATIVE_MEDIA)) {
    const value = match[1];
    if (value) sources.push({ url: value });
  }

  return sources;
}
