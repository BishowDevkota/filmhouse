import type { MediaType } from "@/lib/tmdb";

export interface StreamSource {
  /** Playable URL: an .mp4/.webm file, an HLS manifest, or an embed page. */
  url: string;
  /** "video" renders a <video> element; "embed" renders an iframe. */
  kind: "video" | "embed";
  label?: string;
}

export interface StreamOptions {
  /** Season number for TV titles. Defaults to 1 when omitted. */
  season?: number;
  /** Episode number for TV titles. Defaults to 1 when omitted. */
  episode?: number;
}

/**
 * VidSrc hosts full-length streams keyed purely by TMDB id — no API key or
 * account needed. Override the embed origin with VIDSRC_BASE_URL if the
 * default ever changes.
 *
 *   Movie: /embed/movie/{tmdbId}            → e.g. 550 = Fight Club
 *   TV:    /embed/tv/{tmdbId}/{s}/{e}       → e.g. 1399/1/1 = Game of Thrones S1E1
 */
const VIDSRC_ORIGIN =
  process.env.VIDSRC_BASE_URL?.replace(/\/+$/, "") ??
  "https://vidsrc.link/embed";

export function getStreamSource(
  mediaType: MediaType,
  id: number,
  options: StreamOptions = {},
): StreamSource | null {
  if (mediaType === "movie") {
    return {
      url: `${VIDSRC_ORIGIN}/movie/${id}`,
      kind: "embed",
      label: "VidSrc",
    };
  }

  // A bare show has no "current" episode; start from the pilot unless a
  // future episode picker supplies season/episode.
  const season = Math.max(1, options.season ?? 1);
  const episode = Math.max(1, options.episode ?? 1);
  return {
    url: `${VIDSRC_ORIGIN}/tv/${id}/${season}/${episode}`,
    kind: "embed",
    label: "VidSrc",
  };
}

/* ------------------------------------------------------------------ *
 *  Multi-server playback
 *
 *  Server 1..N sit above the player; each is an independent keyless
 *  source for the same title:
 *
 *    embed  → a player/playback page shown in an <iframe>
 *    hls    → a direct .m3u8 for our built-in <video> (hls.js)
 *    json   → an API fetched client-side; the reply either holds a
 *             playable .m3u8/.mp4 (played in <video>) or a playback
 *             page URL (shown in an <iframe>)
 *
 *  All of them are enabled out of the box — no API keys. Each host's base
 *  URL can be overridden with the matching *_BASE_URL env var if a
 *  mirror moves (see .env.local / README).
 * ------------------------------------------------------------------ */

export type WatchServerKind = "embed" | "hls" | "json";

export interface WatchServer {
  /** Position shown on the button: Server 1, Server 2, … */
  number: number;
  provider: string;
  kind: WatchServerKind;
  /** Short type badge for the button; defaults to the kind's label. */
  kindLabel?: string;
  /** iframe page (embed) or direct .m3u8 (hls). */
  url?: string;
  /** JSON endpoint (kind: "json") fetched for a playable result. */
  apiUrl?: string;
  /** False when the source isn't available — the button shows greyed out. */
  enabled: boolean;
  /** Env var that re-enables an unavailable server, for the tooltip. */
  setupEnv?: string;
}

interface TitleRef {
  mediaType: MediaType;
  tmdbId: number;
  season: number;
  episode: number;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

const VIDKING_BASE = trimSlash(
  process.env.VIDKING_BASE_URL ?? "https://www.vidking.net",
);
const MULTIEMBED_BASE = trimSlash(
  process.env.SUPEREMBED_BASE_URL ?? "https://multiembed.mov",
);
const VIDCORE_BASE = trimSlash(
  process.env.VIDCORE_BASE_URL ?? "https://vidcore.org",
);
const YAPGRID_BASE = trimSlash(
  process.env.YAPGRID_BASE_URL ?? "https://yapgrid.com",
);
const VIDBOLT_BASE = trimSlash(
  process.env.VIDBOLT_BASE_URL ?? "https://vidbolt.pro",
);
const TWOEMBED_BASE = trimSlash(
  process.env.TWOEMBED_BASE_URL ?? "https://www.2embed.cc",
);

type ServerDraft = Omit<WatchServer, "number">;

/** Standard /embed/{movie|tv}/{id}[/{s}/{e}] layout shared by most hosts. */
function standardEmbedDraft(
  base: string,
  provider: string,
  ref: TitleRef,
): ServerDraft {
  const url =
    ref.mediaType === "movie"
      ? `${base}/embed/movie/${ref.tmdbId}`
      : `${base}/embed/tv/${ref.tmdbId}/${ref.season}/${ref.episode}`;
  return { provider, kind: "embed", url, enabled: true };
}

/** VidSrc — its origin already carries the /embed prefix. */
function draftVidSrc(ref: TitleRef): ServerDraft {
  const url =
    ref.mediaType === "movie"
      ? `${VIDSRC_ORIGIN}/movie/${ref.tmdbId}`
      : `${VIDSRC_ORIGIN}/tv/${ref.tmdbId}/${ref.season}/${ref.episode}`;
  return { provider: "VidSrc", kind: "embed", url, enabled: true };
}

/**
 * SuperEmbed — the official multiembed player (multiembed.mov → streamingnow).
 *   movie  ?video_id={tmdb}&tmdb=1
 *   tv     ?video_id={tmdb}&tmdb=1&s={season}&e={episode}
 */
function draftSuperEmbed(ref: TitleRef): ServerDraft {
  const params = new URLSearchParams({
    video_id: String(ref.tmdbId),
    tmdb: "1",
  });
  if (ref.mediaType === "tv") {
    params.set("s", String(ref.season));
    params.set("e", String(ref.episode));
  }
  return {
    provider: "SuperEmbed",
    kind: "embed",
    kindLabel: "Embed",
    url: `${MULTIEMBED_BASE}/?${params.toString()}`,
    enabled: true,
  };
}

/** VidBolt — /movie/{id} and /tv/{id}/{s}/{e} (no /embed prefix). */
function draftVidBolt(ref: TitleRef): ServerDraft {
  const url =
    ref.mediaType === "movie"
      ? `${VIDBOLT_BASE}/movie/${ref.tmdbId}`
      : `${VIDBOLT_BASE}/tv/${ref.tmdbId}/${ref.season}/${ref.episode}`;
  return { provider: "VidBolt", kind: "embed", url, enabled: true };
}

/**
 * The servers shown above the player, in order (numbered Server 1..N). TV
 * pages pass season/episode so episode-precise servers key correctly. Every
 * entry here is a keyless embed/player iframe.
 */
export function getWatchServers(
  mediaType: MediaType,
  tmdbId: number,
  options: StreamOptions = {},
): WatchServer[] {
  const season = Math.max(1, options.season ?? 1);
  const episode = Math.max(1, options.episode ?? 1);
  const ref: TitleRef = { mediaType, tmdbId, season, episode };

  const drafts: ServerDraft[] = [
    draftVidSrc(ref),
    draftSuperEmbed(ref),
    standardEmbedDraft(VIDKING_BASE, "VidKing", ref),
    standardEmbedDraft(VIDCORE_BASE, "VidCore", ref),
    standardEmbedDraft(YAPGRID_BASE, "YapGrid", ref),
    draftVidBolt(ref),
    standardEmbedDraft(TWOEMBED_BASE, "2Embed", ref),
  ];
  return drafts.map((server, index) => ({ ...server, number: index + 1 }));
}

/** Button copy differs between films and series. */
export function watchLabel(mediaType: MediaType): string {
  return mediaType === "movie" ? "Watch Movie" : "Watch Series";
}

/**
 * Play route nested under a title&apos;s detail page. The slug comes from the
 * browsed category (movies, tv-shows, anime, …); the action segment follows
 * the media type so only matching routes exist.
 */
export function watchPath(
  slug: string,
  mediaType: MediaType,
  id: number,
): string {
  const action = mediaType === "movie" ? "watch-movie" : "watch-series";
  return `/${slug}/${id}/${action}`;
}
