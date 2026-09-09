/**
 * Platforms this resolver will not extract from.
 *
 * These services either protect their content with DRM or require, in their
 * terms, that playback happens in their own player. Extracting a stream URL
 * from them is exactly the thing this project refuses to do, so they are
 * matched deliberately and refused with an explanation rather than being left
 * to the generic scanner.
 *
 * Matching here is a policy statement, not a technical limitation.
 */

import "server-only";

import { ResolverError } from "@/lib/resolver/errors";
import type { VideoProvider } from "@/lib/resolver/types";
import { hostMatches } from "@/lib/security/domain-policy";

interface RestrictedEntry {
  domains: string[];
  reason: string;
}

const RESTRICTED: RestrictedEntry[] = [
  {
    domains: ["youtube.com", "youtu.be", "youtube-nocookie.com", "ytimg.com"],
    reason:
      "YouTube's Terms of Service require playback through the YouTube player or its official embed.",
  },
  {
    domains: ["vimeo.com", "player.vimeo.com"],
    reason:
      "Vimeo's Terms of Service require playback through the Vimeo player or its official embed.",
  },
  {
    domains: ["dailymotion.com", "dai.ly"],
    reason: "Dailymotion's Terms of Service require playback through its own player.",
  },
  {
    domains: [
      "netflix.com",
      "primevideo.com",
      "disneyplus.com",
      "hulu.com",
      "max.com",
      "hbomax.com",
    ],
    reason:
      "This is a DRM-protected subscription service. Its streams cannot be played outside its own app.",
  },
  {
    domains: ["twitch.tv", "ttvnw.net"],
    reason:
      "Twitch's Terms of Service require playback through the Twitch player or its official embed.",
  },
  {
    domains: ["facebook.com", "instagram.com", "fb.watch", "tiktok.com"],
    reason: "This platform's Terms of Service require playback through its own embed.",
  },
  {
    domains: ["spotify.com", "music.apple.com", "tv.apple.com"],
    reason: "This is a DRM-protected subscription service.",
  },
];

function findEntry(hostname: string): RestrictedEntry | undefined {
  return RESTRICTED.find((entry) => entry.domains.some((domain) => hostMatches(hostname, domain)));
}

export const RestrictedProvider: VideoProvider = {
  name: "Restricted",

  info: {
    name: "Restricted",
    domains: RESTRICTED.flatMap((entry) => entry.domains),
    formats: [],
    requiresBrowser: false,
    description:
      "Platforms that are refused on purpose: their terms require their own player, or their content is DRM-protected. Matched so the refusal is explicit rather than an extraction failure.",
  },

  /** Never falls through to the generic scanner — that would defeat the point. */
  allowGenericFallback: false,

  canHandle(url) {
    return findEntry(url.hostname) !== undefined;
  },

  async resolve(url) {
    const entry = findEntry(url.hostname);
    throw new ResolverError(
      "unsupported_provider",
      entry?.reason ?? "This provider is not supported.",
      `restricted:${url.hostname}`,
    );
  },
};
