import {
  getTitle,
  getYear,
  imageUrl,
  profileUrl,
  stillUrl,
  type MediaType,
  type TmdbDetails,
  type TmdbEpisode,
  type TmdbSeason,
  type TmdbSeasonSummary,
} from "@/lib/tmdb";

/**
 * Plain, serializable snapshot of a title's metadata + cast, handed to the
 * watch pages so the info panel around the player can be rendered without
 * re-reading TMDB shapes in every component.
 */

export interface WatchCastMember {
  id: number;
  name: string;
  character?: string;
  image: string | null;
}

export interface WatchFact {
  label: string;
  value: string;
}

export interface WatchTitleInfo {
  mediaType: MediaType;
  title: string;
  year: string | null;
  tagline: string | null;
  overview: string | null;
  poster: string | null;
  /** Wide art used as the ambient backdrop behind the player. */
  backdrop: string | null;
  /** Percentage match, 0–100, derived from TMDB's vote average. */
  rating: number | null;
  /** TMDB's raw 0–10 score, e.g. "8.4". */
  score: string | null;
  voteCount: number | null;
  genres: string[];
  /** Headline stats shown as chips beside the title. */
  releaseDate: string | null;
  releaseLabel: string;
  runtimeLabel: string | null;
  facts: WatchFact[];
  creatorsLabel: string;
  creators: string[];
  studiosLabel: string;
  studios: string[];
  cast: WatchCastMember[];
}

function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

function formatDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Budget and box office read better as "$185M" than as nine digits. */
function formatMoney(amount: number | undefined): string | null {
  if (!amount || amount <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

/** "hi" → "Hindi". Falls back to the upper-cased tag on exotic codes. */
function formatLanguage(code: string | undefined): string | null {
  if (!code) return null;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    if (name && name !== code) return name;
  } catch {
    // Intl.DisplayNames is unavailable or the code is malformed.
  }
  return code.toUpperCase();
}

/** Pick the main people behind a title: directors for film, creators for TV. */
function pickCreators(
  mediaType: MediaType,
  details: TmdbDetails,
): { label: string; names: string[] } {
  if (mediaType === "movie") {
    const directors = (details.credits?.crew ?? [])
      .filter((person) => person.job === "Director")
      .map((person) => person.name)
      .filter((name, index, all) => all.indexOf(name) === index)
      .slice(0, 3);
    return { label: "Director", names: directors };
  }
  return {
    label: "Creator",
    names: (details.created_by ?? []).slice(0, 3).map((person) => person.name),
  };
}

/** Networks carry a series; studios carry a film. */
function pickStudios(
  mediaType: MediaType,
  details: TmdbDetails,
): { label: string; names: string[] } {
  const companies =
    mediaType === "tv"
      ? (details.networks ?? details.production_companies ?? [])
      : (details.production_companies ?? []);
  return {
    label: mediaType === "tv" ? "Network" : "Studio",
    names: companies.slice(0, 3).map((company) => company.name),
  };
}

export function toWatchInfo(
  details: TmdbDetails,
  mediaType: MediaType,
): WatchTitleInfo {
  const isTv = mediaType === "tv";
  const creators = pickCreators(mediaType, details);
  const studios = pickStudios(mediaType, details);

  const releaseDate = formatDate(
    isTv ? details.first_air_date : details.release_date,
  );
  const episodeRuntime = details.episode_run_time?.find((value) => value > 0);
  const runtimeLabel = isTv
    ? episodeRuntime
      ? `${formatRuntime(episodeRuntime)} / ep`
      : null
    : details.runtime
      ? formatRuntime(details.runtime)
      : null;

  const facts: WatchFact[] = [];
  if (releaseDate) {
    facts.push({ label: isTv ? "First aired" : "Released", value: releaseDate });
  }
  if (isTv) {
    const lastAired = formatDate(details.last_air_date);
    if (lastAired) facts.push({ label: "Last aired", value: lastAired });
    if (details.number_of_seasons) {
      const seasons = `${details.number_of_seasons} season${
        details.number_of_seasons > 1 ? "s" : ""
      }`;
      facts.push({
        label: "Seasons",
        value: details.number_of_episodes
          ? `${seasons} · ${details.number_of_episodes} episodes`
          : seasons,
      });
    }
  } else if (runtimeLabel) {
    facts.push({ label: "Runtime", value: runtimeLabel });
  }
  if (details.status) {
    facts.push({ label: "Status", value: details.status });
  }
  const language = formatLanguage(details.original_language);
  if (language) {
    facts.push({ label: "Original language", value: language });
  }
  if (!isTv) {
    const budget = formatMoney(details.budget);
    if (budget) facts.push({ label: "Budget", value: budget });
    const revenue = formatMoney(details.revenue);
    if (revenue) facts.push({ label: "Box office", value: revenue });
  }
  if (studios.names.length) {
    facts.push({
      label: studios.names.length > 1 ? `${studios.label}s` : studios.label,
      value: studios.names.join(", "),
    });
  }

  const cast: WatchCastMember[] = [...(details.credits?.cast ?? [])]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 16)
    .map((person) => ({
      id: person.id,
      name: person.name,
      character: person.character,
      image: profileUrl(person.profile_path),
    }));

  return {
    mediaType,
    title: getTitle(details),
    year: getYear(details) || null,
    tagline: details.tagline?.trim() || null,
    overview: details.overview?.trim() || null,
    poster: imageUrl(details.poster_path, "w500"),
    backdrop: imageUrl(details.backdrop_path, "w1280"),
    rating: details.vote_average ? Math.round(details.vote_average * 10) : null,
    score: details.vote_average ? details.vote_average.toFixed(1) : null,
    voteCount: details.vote_count ?? null,
    genres: (details.genres ?? []).map((genre) => genre.name),
    releaseDate,
    releaseLabel: isTv ? "First aired" : "Released",
    runtimeLabel,
    facts,
    creatorsLabel: creators.label,
    creators: creators.names,
    studiosLabel: studios.label,
    studios: studios.names,
    cast,
  };
}

/* ------------------------------------------------------------------ *
 * Series guide: the season/episode picker shown under the player.
 * ------------------------------------------------------------------ */

export interface WatchEpisode {
  id: number;
  number: number;
  name: string;
  overview: string | null;
  airDate: string | null;
  runtimeLabel: string | null;
  still: string | null;
  score: string | null;
}

export interface WatchSeasonOption {
  number: number;
  name: string;
  episodeCount: number | null;
}

export interface WatchSeriesGuide {
  seasons: WatchSeasonOption[];
  /** The season currently playing. */
  season: number;
  seasonName: string;
  /** The episode currently playing, 1-based. */
  episode: number;
  episodes: WatchEpisode[];
}

/** Seasons worth offering: specials (season 0) and empty seasons are dropped. */
function playableSeasons(details: TmdbDetails): TmdbSeasonSummary[] {
  const seasons = (details.seasons ?? []).filter(
    (season) =>
      season.season_number >= 1 && (season.episode_count ?? 1) > 0,
  );
  return seasons.sort((a, b) => a.season_number - b.season_number);
}

function toPositiveInt(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Which season a `?season=` query should actually play. Unknown or out-of-range
 * values fall back to the first season the show has, so a hand-edited URL can
 * never point the player at an episode that does not exist.
 */
export function resolveSeason(
  details: TmdbDetails,
  raw: string | string[] | undefined,
): number {
  const seasons = playableSeasons(details);
  const requested = toPositiveInt(raw);
  if (requested && seasons.some((s) => s.season_number === requested)) {
    return requested;
  }
  return seasons[0]?.season_number ?? 1;
}

/** Same idea for `?episode=`, clamped against the season actually loaded. */
export function resolveEpisode(
  raw: string | string[] | undefined,
  episodes: TmdbEpisode[],
): number {
  const requested = toPositiveInt(raw);
  if (!requested) return episodes[0]?.episode_number ?? 1;
  if (!episodes.length) return requested;
  return episodes.some((e) => e.episode_number === requested)
    ? requested
    : (episodes[0]?.episode_number ?? 1);
}

function formatShortDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function toSeriesGuide(
  details: TmdbDetails,
  season: TmdbSeason | null,
  seasonNumber: number,
  episodeNumber: number,
): WatchSeriesGuide {
  const summaries = playableSeasons(details);
  const seasons: WatchSeasonOption[] = summaries.length
    ? summaries.map((entry) => ({
        number: entry.season_number,
        name: entry.name || `Season ${entry.season_number}`,
        episodeCount: entry.episode_count ?? null,
      }))
    : [{ number: seasonNumber, name: `Season ${seasonNumber}`, episodeCount: null }];

  const episodes: WatchEpisode[] = (season?.episodes ?? []).map((episode) => ({
    id: episode.id,
    number: episode.episode_number,
    name: episode.name || `Episode ${episode.episode_number}`,
    overview: episode.overview?.trim() || null,
    airDate: formatShortDate(episode.air_date),
    runtimeLabel: episode.runtime ? formatRuntime(episode.runtime) : null,
    still: stillUrl(episode.still_path),
    score: episode.vote_average ? episode.vote_average.toFixed(1) : null,
  }));

  return {
    seasons,
    season: seasonNumber,
    seasonName:
      season?.name ||
      seasons.find((entry) => entry.number === seasonNumber)?.name ||
      `Season ${seasonNumber}`,
    episode: episodeNumber,
    episodes,
  };
}
