/**
 * Turn scraped candidates into the `StreamSource` objects the player consumes.
 *
 * All the messiness of extraction stops here: relative URLs are resolved,
 * escaping is undone, formats are inferred, duplicates collapse, and anything
 * that is not a recognizable media URL is dropped.
 */

import type { StreamSource, StreamType } from "@/types/video";
import type { RawSource } from "@/lib/resolver/types";
import {
  canonicalizeUrl,
  heightFromQualityLabel,
  mimeTypeFor,
  qualityLabelForHeight,
  streamTypeForUrl,
  toAbsoluteUrl,
} from "@/lib/utils/urls";

/** Coerce a possibly-stringy numeric field into a sane positive integer. */
function positiveInt(value: unknown, max: number): number | undefined {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) return undefined;
  return Math.round(parsed);
}

/**
 * Normalize one candidate.
 *
 * @param raw    The scraped source.
 * @param base   URL the candidate was found on, used to resolve relative paths.
 * @returns The normalized source, or `null` when the candidate is unusable.
 */
export function normalizeSource(raw: RawSource, base?: string | URL): StreamSource | null {
  if (!raw?.url || typeof raw.url !== "string") return null;

  const url = toAbsoluteUrl(raw.url, base ?? "");
  if (!url) return null;

  const type: StreamType | null = raw.type ?? streamTypeForUrl(url);
  if (!type) return null;

  const width = positiveInt(raw.width, 16_000);
  const height = positiveInt(raw.height, 16_000);
  const bitrate = positiveInt(raw.bitrate, 1_000_000_000);

  // A DASH manifest always describes every representation. HLS masters are only
  // trusted when the provider says so, since the URL alone cannot prove it.
  const isMaster = raw.isMaster ?? type === "dash";

  // An adaptive manifest is labelled "Auto": the player's ABR logic chooses the
  // rendition, so naming the tallest one would misrepresent what is playing.
  // The height is still recorded as the ceiling the manifest advertises.
  const quality =
    raw.quality?.trim() ||
    (isMaster ? "Auto" : undefined) ||
    (height ? qualityLabelForHeight(height) : undefined);

  const source: StreamSource = {
    url: url.toString(),
    type,
    mimeType: raw.mimeType?.trim() || mimeTypeFor(type),
  };

  if (quality) source.quality = quality;
  if (width) source.width = width;
  if (height) source.height = height;
  else if (quality) {
    const inferred = heightFromQualityLabel(quality);
    if (inferred) source.height = inferred;
  }
  if (bitrate) source.bitrate = bitrate;
  if (raw.language) source.language = raw.language;
  if (raw.headers && Object.keys(raw.headers).length > 0) source.headers = raw.headers;
  if (isMaster) source.isMaster = true;

  return source;
}

/**
 * Rank sources for the quality menu: adaptive manifests first (they let the
 * player choose), then by resolution and bitrate, highest first.
 */
export function compareSources(a: StreamSource, b: StreamSource): number {
  if (a.isMaster !== b.isMaster) return a.isMaster ? -1 : 1;

  const heightDelta = (b.height ?? 0) - (a.height ?? 0);
  if (heightDelta !== 0) return heightDelta;

  const bitrateDelta = (b.bitrate ?? 0) - (a.bitrate ?? 0);
  if (bitrateDelta !== 0) return bitrateDelta;

  // Stable, predictable tail ordering.
  return a.url.localeCompare(b.url);
}

/**
 * Normalize a batch: drop unusable candidates, collapse duplicates, and sort.
 *
 * Duplicates are keyed on the canonical URL, so two spellings of the same file
 * produce one entry. When both spellings carry metadata, the richer one wins.
 */
export function normalizeSources(raws: RawSource[], base?: string | URL): StreamSource[] {
  const byKey = new Map<string, StreamSource>();

  for (const raw of raws) {
    const source = normalizeSource(raw, base);
    if (!source) continue;

    const key = canonicalizeUrl(new URL(source.url));
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, source);
      continue;
    }

    // Prefer whichever entry knows more about the stream.
    const existingScore = score(existing);
    const candidateScore = score(source);
    if (candidateScore > existingScore) byKey.set(key, source);
  }

  return [...byKey.values()].sort(compareSources);
}

function score(source: StreamSource): number {
  let value = 0;
  if (source.height) value += 4;
  if (source.width) value += 1;
  if (source.bitrate) value += 2;
  if (source.quality) value += 1;
  if (source.isMaster) value += 1;
  return value;
}
