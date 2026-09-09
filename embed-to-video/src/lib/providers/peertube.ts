/**
 * PeerTube — federated, open-source video hosting.
 *
 * PeerTube publishes a documented, unauthenticated REST API and every instance
 * serves its media over plain HTTP(S) with no DRM, so reading the video's own
 * API entry is the intended way to discover its files.
 *
 * PeerTube is federated: any hostname can be an instance, so this adapter
 * matches on the URL shape rather than a domain list, and confirms by the shape
 * of the API response.
 *
 * API: GET /api/v1/videos/{id}  —  https://docs.joinpeertube.org/api-rest-reference.html
 */

import "server-only";

import { ResolverError } from "@/lib/resolver/errors";
import type {
  ProviderPayload,
  RawSource,
  ResolveContext,
  VideoProvider,
} from "@/lib/resolver/types";
import { apiRequestHeaders } from "@/lib/utils/headers";

/** `/videos/embed/{id}`, `/videos/watch/{id}` and the short `/w/{id}` form. */
const PATH_PATTERNS = [
  /^\/videos\/(?:embed|watch)\/([0-9a-zA-Z-]{6,64})\/?$/,
  /^\/w\/([0-9a-zA-Z]{8,64})\/?$/,
];

function videoIdFrom(url: URL): string | null {
  for (const pattern of PATH_PATTERNS) {
    const match = pattern.exec(url.pathname);
    if (match) return match[1];
  }
  return null;
}

interface PeerTubeFile {
  resolution?: { id?: number; label?: string };
  fileUrl?: string;
  fileDownloadUrl?: string;
  size?: number;
  fps?: number;
  width?: number;
  height?: number;
}

interface PeerTubeVideo {
  uuid?: string;
  name?: string;
  duration?: number;
  thumbnailPath?: string;
  previewPath?: string;
  isLive?: boolean;
  files?: PeerTubeFile[];
  streamingPlaylists?: Array<{
    type?: number;
    playlistUrl?: string;
    files?: PeerTubeFile[];
  }>;
}

/** Turn a PeerTube file entry into a raw source. */
function toRawSource(file: PeerTubeFile): RawSource | null {
  const url = file.fileUrl ?? file.fileDownloadUrl;
  if (!url) return null;

  const height = file.height ?? file.resolution?.id;
  return {
    url,
    quality: file.resolution?.label?.trim() || undefined,
    height: typeof height === "number" && height > 0 ? height : undefined,
    width: file.width,
  };
}

export const PeerTubeProvider: VideoProvider = {
  name: "PeerTube",

  info: {
    name: "PeerTube",
    domains: ["any PeerTube instance (matched by URL shape)"],
    formats: ["hls", "mp4", "webm"],
    requiresBrowser: false,
    description:
      "Federated open-source video hosting. Resolved through PeerTube's documented public REST API; returns the HLS master playlist plus any progressive MP4/WebM renditions.",
  },

  canHandle(url) {
    return videoIdFrom(url) !== null;
  },

  async resolve(url, context: ResolveContext): Promise<ProviderPayload> {
    const id = videoIdFrom(url);
    if (!id) throw new ResolverError("unsupported_provider", "Not a PeerTube video URL.");

    const api = new URL(`/api/v1/videos/${encodeURIComponent(id)}`, url.origin);
    const video = await context.fetchJson<PeerTubeVideo>(api, {
      headers: apiRequestHeaders(),
      signal: context.signal,
    });

    // Confirm this really is PeerTube rather than a coincidental URL shape.
    if (!video || typeof video !== "object" || (!video.uuid && !video.name)) {
      throw new ResolverError(
        "unsupported_provider",
        "That host does not appear to be a PeerTube instance.",
      );
    }

    const sources: RawSource[] = [];

    // The HLS master is preferred: it carries every rendition and lets the
    // player's ABR logic choose.
    for (const playlist of video.streamingPlaylists ?? []) {
      if (playlist.playlistUrl) {
        sources.push({ url: playlist.playlistUrl, type: "hls", isMaster: true, quality: "Auto" });
      }
      for (const file of playlist.files ?? []) {
        const source = toRawSource(file);
        if (source) sources.push(source);
      }
    }

    for (const file of video.files ?? []) {
      const source = toRawSource(file);
      if (source) sources.push(source);
    }

    const thumbnailPath = video.previewPath ?? video.thumbnailPath;

    return {
      sources,
      baseUrl: url.origin,
      title: video.name?.trim() || undefined,
      thumbnail: thumbnailPath ? new URL(thumbnailPath, url.origin).toString() : undefined,
      duration:
        typeof video.duration === "number" && video.duration > 0 ? video.duration : undefined,
    };
  },
};
