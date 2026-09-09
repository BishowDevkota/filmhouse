/**
 * HLS playlist inspection.
 *
 * A `.m3u8` URL alone does not say whether it is a master playlist (a list of
 * variants, which the player's ABR logic should drive) or a single rendition.
 * Fetching the first few kilobytes settles it, which is what lets the UI show
 * an honest "Auto" entry instead of guessing from the filename.
 */

import "server-only";

import type { RawSource } from "@/lib/resolver/types";
import type { ResolveContext } from "@/lib/resolver/types";

export interface PlaylistInfo {
  isMaster: boolean;
  /** Highest resolution advertised by any variant, when the master declares it. */
  maxHeight?: number;
  maxWidth?: number;
  /** Highest advertised bandwidth, in bits per second. */
  maxBitrate?: number;
  variantCount: number;
}

/**
 * Parse a playlist body. Only the master's `#EXT-X-STREAM-INF` attributes are
 * read; variant URLs are deliberately not expanded into separate sources,
 * because handing the master to the player is strictly better than picking a
 * rendition on its behalf.
 */
export function parseHlsPlaylist(body: string): PlaylistInfo {
  const info: PlaylistInfo = { isMaster: false, variantCount: 0 };
  if (!body.includes("#EXTM3U")) return info;

  const streamInfLines = body.match(/#EXT-X-STREAM-INF:[^\n\r]*/gi);
  if (!streamInfLines || streamInfLines.length === 0) return info;

  info.isMaster = true;
  info.variantCount = streamInfLines.length;

  for (const line of streamInfLines) {
    const resolution = /RESOLUTION=(\d+)x(\d+)/i.exec(line);
    if (resolution) {
      const width = Number.parseInt(resolution[1], 10);
      const height = Number.parseInt(resolution[2], 10);
      if (Number.isFinite(height) && height > (info.maxHeight ?? 0)) {
        info.maxHeight = height;
        info.maxWidth = Number.isFinite(width) ? width : undefined;
      }
    }

    const bandwidth = /(?:AVERAGE-)?BANDWIDTH=(\d+)/i.exec(line);
    if (bandwidth) {
      const value = Number.parseInt(bandwidth[1], 10);
      if (Number.isFinite(value) && value > (info.maxBitrate ?? 0)) info.maxBitrate = value;
    }
  }

  return info;
}

/** Bytes of a playlist worth reading; masters are small. */
const PLAYLIST_BYTE_CAP = 256 * 1024;

/**
 * Probe HLS candidates and annotate them in place.
 *
 * Bounded by `maxProbes` so a page advertising many playlists cannot turn one
 * API call into a burst of outbound requests. Any probe failure is non-fatal:
 * the source is still returned, just without the master annotation.
 */
export async function annotateHlsSources(
  sources: RawSource[],
  context: ResolveContext,
  maxProbes = 3,
): Promise<RawSource[]> {
  const annotated = [...sources];
  let probes = 0;

  for (let index = 0; index < annotated.length && probes < maxProbes; index += 1) {
    const source = annotated[index];
    const isHls = source.type === "hls" || /\.m3u8(\?|#|$)/i.test(source.url);
    if (!isHls || source.isMaster !== undefined) continue;

    let target: URL;
    try {
      target = new URL(source.url);
    } catch {
      continue; // Still relative; the normalizer will resolve it later.
    }

    probes += 1;
    try {
      const response = await context.fetchText(target, {
        maxBytes: PLAYLIST_BYTE_CAP,
        signal: context.signal,
      });
      const info = parseHlsPlaylist(response.body);
      if (!info.isMaster) continue;

      annotated[index] = {
        ...source,
        type: "hls",
        isMaster: true,
        height: source.height ?? info.maxHeight,
        width: source.width ?? info.maxWidth,
        bitrate: source.bitrate ?? info.maxBitrate,
      };
      context.logger.debug({
        event: "hls_probe",
        result: "master",
        variants: info.variantCount,
        maxHeight: info.maxHeight ?? "unknown",
      });
    } catch {
      context.logger.debug({ event: "hls_probe", result: "failed" });
    }
  }

  return annotated;
}
