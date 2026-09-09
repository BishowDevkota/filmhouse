/**
 * Static HTML extraction.
 *
 * Reads the parts of a page that are *meant* to be machine-readable — the
 * `<video>`/`<source>` elements, Open Graph video tags and schema.org
 * `VideoObject` metadata — plus the handful of data attributes that common
 * open-source players use to declare their file.
 */

import "server-only";

import * as cheerio from "cheerio";

import type { RawSource } from "@/lib/resolver/types";
import type { StreamType } from "@/types/video";

export interface HtmlExtraction {
  sources: RawSource[];
  title?: string;
  thumbnail?: string;
  duration?: number;
}

/** Map a `type` attribute or `og:video:type` onto our stream vocabulary. */
function typeFromMime(mime: string | undefined): StreamType | undefined {
  if (!mime) return undefined;
  const value = mime.toLowerCase();
  if (value.includes("mpegurl")) return "hls";
  if (value.includes("dash")) return "dash";
  if (value.includes("webm")) return "webm";
  if (value.includes("mp4")) return "mp4";
  return undefined;
}

/** Parse an ISO-8601 duration (`PT1H2M3S`) or a plain seconds value. */
export function parseDuration(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
  }

  const text = value.trim();
  if (!text) return undefined;

  const iso = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/i.exec(text);
  if (iso) {
    const hours = Number.parseFloat(iso[1] ?? "0");
    const minutes = Number.parseFloat(iso[2] ?? "0");
    const seconds = Number.parseFloat(iso[3] ?? "0");
    const total = hours * 3600 + minutes * 60 + seconds;
    return total > 0 ? Math.round(total) : undefined;
  }

  const numeric = Number.parseFloat(text);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : undefined;
}

/** Numeric attribute helper that tolerates `"1080"`, `"1080px"` and junk. */
function numeric(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Attributes that open-source players use to declare a media file. */
const SOURCE_ATTRIBUTES = [
  "src",
  "data-src",
  "data-video-src",
  "data-video",
  "data-file",
  "data-hls",
  "data-mp4",
  "data-dash",
  "data-source",
  "data-stream",
  "data-play-url",
];

/**
 * Walk the parsed JSON-LD graph looking for `VideoObject` nodes. schema.org
 * metadata is published for machines to read, so `contentUrl` is the most
 * clearly-authorized signal on a page.
 */
function collectJsonLd(node: unknown, into: HtmlExtraction, depth = 0): void {
  if (!node || depth > 6) return;

  if (Array.isArray(node)) {
    for (const item of node) collectJsonLd(item, into, depth + 1);
    return;
  }

  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;

  if (Array.isArray(record["@graph"])) collectJsonLd(record["@graph"], into, depth + 1);

  const nodeType = record["@type"];
  const types = Array.isArray(nodeType) ? nodeType : [nodeType];
  const isVideo = types.some(
    (entry) => typeof entry === "string" && entry.toLowerCase().includes("videoobject"),
  );

  if (isVideo) {
    const contentUrl = record.contentUrl ?? record.contentURL;
    if (typeof contentUrl === "string") {
      into.sources.push({ url: contentUrl });
    } else if (Array.isArray(contentUrl)) {
      for (const entry of contentUrl) {
        if (typeof entry === "string") into.sources.push({ url: entry });
      }
    }

    if (!into.title && typeof record.name === "string") into.title = record.name;
    if (!into.thumbnail) {
      const thumbnail = record.thumbnailUrl ?? record.thumbnail;
      if (typeof thumbnail === "string") into.thumbnail = thumbnail;
      else if (Array.isArray(thumbnail) && typeof thumbnail[0] === "string") {
        into.thumbnail = thumbnail[0];
      }
    }
    if (!into.duration) {
      into.duration = parseDuration(record.duration as string | number | undefined);
    }
  }

  // Nested objects can hold the VideoObject (e.g. inside a WebPage node).
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") collectJsonLd(value, into, depth + 1);
  }
}

/**
 * Extract every declared media source and the page's video metadata.
 *
 * URLs come back exactly as written in the document; resolving and validating
 * them is the normalizer's job.
 */
export function extractFromHtml(html: string): HtmlExtraction {
  const result: HtmlExtraction = { sources: [] };
  if (!html) return result;

  const $ = cheerio.load(html);

  /* ---- <video> and its <source> children -------------------------------- */

  $("video").each((_, element) => {
    const video = $(element);

    for (const attribute of SOURCE_ATTRIBUTES) {
      const value = video.attr(attribute);
      if (value) {
        result.sources.push({
          url: value,
          type: typeFromMime(video.attr("type")),
          width: numeric(video.attr("width")),
          height: numeric(video.attr("height")),
        });
      }
    }

    const poster = video.attr("poster");
    if (poster && !result.thumbnail) result.thumbnail = poster;
  });

  $("source, video > source").each((_, element) => {
    const source = $(element);

    for (const attribute of SOURCE_ATTRIBUTES) {
      const value = source.attr(attribute);
      if (!value) continue;

      // Players annotate variants in several ways; `size` and `label` are the
      // conventions used by Plyr and JW-style configs respectively.
      const label = source.attr("label") ?? source.attr("data-label") ?? source.attr("title");
      const height =
        numeric(source.attr("height")) ??
        numeric(source.attr("size")) ??
        numeric(source.attr("data-res")) ??
        numeric(source.attr("res"));

      result.sources.push({
        url: value,
        type: typeFromMime(source.attr("type")),
        quality: label?.trim() || undefined,
        width: numeric(source.attr("width")),
        height,
        language: source.attr("srclang")?.trim() || undefined,
      });
    }
  });

  /* ---- Open Graph / Twitter player metadata ----------------------------- */

  const meta = (selector: string): string | undefined => {
    const value = $(selector).first().attr("content");
    return value?.trim() || undefined;
  };

  const ogVideo =
    meta('meta[property="og:video:secure_url"]') ??
    meta('meta[property="og:video:url"]') ??
    meta('meta[property="og:video"]') ??
    meta('meta[name="twitter:player:stream"]');

  if (ogVideo) {
    result.sources.push({
      url: ogVideo,
      type:
        typeFromMime(meta('meta[property="og:video:type"]')) ??
        typeFromMime(meta('meta[name="twitter:player:stream:content_type"]')),
      width: numeric(meta('meta[property="og:video:width"]')),
      height: numeric(meta('meta[property="og:video:height"]')),
    });
  }

  result.title =
    result.title ??
    meta('meta[property="og:title"]') ??
    meta('meta[name="twitter:title"]') ??
    $("title").first().text().trim() ??
    undefined;

  result.thumbnail =
    result.thumbnail ??
    meta('meta[property="og:image:secure_url"]') ??
    meta('meta[property="og:image"]') ??
    meta('meta[name="twitter:image"]');

  result.duration =
    result.duration ??
    parseDuration(meta('meta[property="og:video:duration"]')) ??
    parseDuration(meta('meta[property="video:duration"]'));

  /* ---- <link rel="preload" as="video"> ---------------------------------- */

  $('link[as="video"][href], link[rel="preload"][href]').each((_, element) => {
    const link = $(element);
    if (link.attr("as") !== "video") return;
    const href = link.attr("href");
    if (href) result.sources.push({ url: href, type: typeFromMime(link.attr("type")) });
  });

  /* ---- schema.org JSON-LD ----------------------------------------------- */

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text().trim();
    if (!raw) return;
    try {
      collectJsonLd(JSON.parse(raw), result);
    } catch {
      // Malformed JSON-LD is common; ignore this block and keep going.
    }
  });

  /* ---- data-* attributes on player containers --------------------------- */

  $("[data-hls], [data-mp4], [data-dash], [data-video-src], [data-file]").each((_, element) => {
    const node = $(element);
    if (node.is("video") || node.is("source")) return;

    const candidates: Array<[string | undefined, StreamType | undefined]> = [
      [node.attr("data-hls"), "hls"],
      [node.attr("data-dash"), "dash"],
      [node.attr("data-mp4"), "mp4"],
      [node.attr("data-video-src"), undefined],
      [node.attr("data-file"), undefined],
    ];

    for (const [value, type] of candidates) {
      if (value) result.sources.push({ url: value, type });
    }
  });

  if (result.title === "") delete result.title;
  return result;
}
