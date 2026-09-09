/**
 * Direct media URLs.
 *
 * The simplest adapter: the URL already points at a manifest or a container, so
 * there is nothing to extract. Useful on its own, and it keeps the pipeline
 * honest — every other provider ultimately produces one of these.
 */

import "server-only";

import { annotateHlsSources } from "@/lib/extraction/manifest";
import type { ProviderPayload, ResolveContext, VideoProvider } from "@/lib/resolver/types";
import { streamTypeForUrl } from "@/lib/utils/urls";

export const DirectMediaProvider: VideoProvider = {
  name: "DirectMedia",

  info: {
    name: "DirectMedia",
    domains: ["*"],
    formats: ["hls", "mp4", "webm", "dash"],
    requiresBrowser: false,
    description:
      "A URL that already points at a media file or manifest. Passed straight through; HLS playlists are probed to detect a master.",
  },

  canHandle(url) {
    return streamTypeForUrl(url) !== null;
  },

  async resolve(url, context: ResolveContext): Promise<ProviderPayload> {
    const type = streamTypeForUrl(url) ?? undefined;
    const sources = await annotateHlsSources([{ url: url.toString(), type }], context, 1);

    return {
      sources,
      baseUrl: url.toString(),
      title: decodeURIComponent(url.pathname.split("/").pop() ?? "") || undefined,
    };
  },
};
