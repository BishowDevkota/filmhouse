/**
 * Internet Archive (archive.org).
 *
 * The Archive publishes a public metadata API for exactly this purpose, and its
 * items are openly licensed or public domain. The API lists every derivative
 * file an item has, which gives a real quality ladder without any guessing.
 *
 * API: GET https://archive.org/metadata/{identifier}
 */

import "server-only";

import { ResolverError } from "@/lib/resolver/errors";
import type {
  ProviderPayload,
  RawSource,
  ResolveContext,
  VideoProvider,
} from "@/lib/resolver/types";
import { hostMatches } from "@/lib/security/domain-policy";
import { apiRequestHeaders } from "@/lib/utils/headers";
import type { StreamType } from "@/types/video";

const DOMAINS = ["archive.org", "web.archive.org"];

/** `/embed/{id}`, `/details/{id}`, `/download/{id}` all identify an item. */
const PATH_PATTERN = /^\/(?:embed|details|download|stream)\/([^/?#]+)/;

function identifierFrom(url: URL): string | null {
  const match = PATH_PATTERN.exec(url.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

interface ArchiveFile {
  name?: string;
  format?: string;
  size?: string;
  height?: string;
  width?: string;
  length?: string;
  source?: string;
}

interface ArchiveMetadata {
  files?: ArchiveFile[];
  metadata?: { title?: string | string[]; identifier?: string };
  is_dark?: boolean;
}

/** Map an Archive `format` label onto a playable type, or `null` to skip it. */
function typeForFormat(format: string | undefined): StreamType | null {
  if (!format) return null;
  const value = format.toLowerCase();
  if (value.includes("webm")) return "webm";
  if (value.includes("mpeg4") || value.includes("h.264") || value.includes("mp4")) return "mp4";
  return null; // Ogg, MPEG-2, and the rest are not reliably playable in browsers.
}

/** Archive `length` is either seconds ("612.5") or "MM:SS" / "HH:MM:SS". */
function parseLength(length: string | undefined): number | undefined {
  if (!length) return undefined;

  if (length.includes(":")) {
    const parts = length.split(":").map((part) => Number.parseFloat(part));
    if (parts.some((part) => !Number.isFinite(part))) return undefined;
    const seconds = parts.reduce((total, part) => total * 60 + part, 0);
    return seconds > 0 ? Math.round(seconds) : undefined;
  }

  const value = Number.parseFloat(length);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function toInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export const InternetArchiveProvider: VideoProvider = {
  name: "InternetArchive",

  info: {
    name: "InternetArchive",
    domains: DOMAINS,
    formats: ["mp4", "webm"],
    requiresBrowser: false,
    description:
      "Public-domain and openly-licensed media from archive.org, resolved through the Archive's public metadata API. Every derivative the item publishes is offered as a quality option.",
  },

  canHandle(url) {
    return (
      DOMAINS.some((domain) => hostMatches(url.hostname, domain)) && identifierFrom(url) !== null
    );
  },

  async resolve(url, context: ResolveContext): Promise<ProviderPayload> {
    const identifier = identifierFrom(url);
    if (!identifier)
      throw new ResolverError("unsupported_provider", "Not an archive.org item URL.");

    const api = new URL(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
    const metadata = await context.fetchJson<ArchiveMetadata>(api, {
      headers: apiRequestHeaders(),
      signal: context.signal,
    });

    // `is_dark` items return an empty payload, so check that first: it is the
    // accurate explanation, and "no listed files" would be misleading.
    if (metadata?.is_dark) {
      throw new ResolverError(
        "no_source",
        "That archive.org item has been restricted by the Internet Archive and is not publicly available.",
      );
    }
    if (!metadata || !Array.isArray(metadata.files) || metadata.files.length === 0) {
      throw new ResolverError("no_source", "That archive.org item has no listed files.");
    }

    const entries: Array<{ source: RawSource }> = [];
    let duration: number | undefined;

    for (const file of metadata.files) {
      const type = typeForFormat(file.format);
      if (!type || !file.name) continue;

      duration ??= parseLength(file.length);

      // Path segments are encoded individually so slashes inside a name survive.
      const path = file.name.split("/").map(encodeURIComponent).join("/");
      const height = toInt(file.height);
      const format = file.format?.trim();

      entries.push({
        source: {
          url: `https://archive.org/download/${encodeURIComponent(identifier)}/${path}`,
          type,
          height,
          width: toInt(file.width),
          // Prefer a resolution label; the Archive's `format` ("h.264", "512Kb
          // MPEG4") only becomes the label when no height is published.
          quality: height ? undefined : format || undefined,
        },
      });
    }

    // Several derivatives often share a height, so the menu distinguishes them
    // by filename (see `SourceSelector`) rather than by label alone.
    const sources = entries.map((entry) => entry.source);

    if (sources.length === 0) {
      throw new ResolverError(
        "no_source",
        "That archive.org item has no browser-playable video derivative.",
      );
    }

    const rawTitle = metadata.metadata?.title;
    const title = Array.isArray(rawTitle) ? rawTitle[0] : rawTitle;

    return {
      sources,
      baseUrl: "https://archive.org/",
      title: title?.trim() || identifier,
      thumbnail: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
      duration,
    };
  },
};
