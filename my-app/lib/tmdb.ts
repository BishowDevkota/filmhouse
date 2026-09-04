const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

/** How long TMDB responses stay cached, in seconds. Catalogue data barely moves. */
const REVALIDATE = 60 * 60 * 6;

export type MediaType = "movie" | "tv";

export interface TmdbItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: string;
  genre_ids?: number[];
  original_language?: string;
}

export interface TmdbVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface TmdbCompany {
  id: number;
  name: string;
  logo_path?: string | null;
}

export interface TmdbSeasonSummary {
  id: number;
  name: string;
  season_number: number;
  episode_count?: number;
  air_date?: string;
  poster_path?: string | null;
  overview?: string;
}

export interface TmdbEpisode {
  id: number;
  name: string;
  overview?: string;
  episode_number: number;
  season_number: number;
  air_date?: string;
  runtime?: number | null;
  still_path?: string | null;
  vote_average?: number;
}

export interface TmdbSeason extends TmdbSeasonSummary {
  episodes?: TmdbEpisode[];
}

export interface TmdbDetails extends TmdbItem {
  runtime?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  last_air_date?: string;
  genres?: { id: number; name: string }[];
  tagline?: string;
  status?: string;
  homepage?: string;
  budget?: number;
  revenue?: number;
  vote_count?: number;
  networks?: TmdbCompany[];
  production_companies?: TmdbCompany[];
  spoken_languages?: { iso_639_1: string; english_name: string }[];
  seasons?: TmdbSeasonSummary[];
  created_by?: { id: number; name: string; profile_path?: string | null }[];
  videos?: { results: TmdbVideo[] };
  credits?: {
    cast: {
      id: number;
      name: string;
      character?: string;
      profile_path?: string | null;
      order?: number;
    }[];
    crew?: {
      id: number;
      name: string;
      job: string;
      profile_path?: string | null;
    }[];
  };
  similar?: { results: TmdbItem[] };
  recommendations?: { results: TmdbItem[] };
}

interface PagedResponse {
  results: TmdbItem[];
}

export function hasTmdbToken(): boolean {
  return Boolean(process.env.TMDB_ACCESS_TOKEN?.trim());
}

/**
 * Server-only TMDB request. The v4 read access token is sent as a bearer
 * header, so it never reaches the browser.
 */
async function tmdb<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "TMDB_ACCESS_TOKEN is missing. Add it to .env.local and restart the dev server.",
    );
  }

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("include_adult", "false");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
    next: { revalidate: REVALIDATE },
  });

  if (!res.ok) {
    throw new Error(
      `TMDB request failed (${res.status} ${res.statusText}): ${path}`,
    );
  }

  return res.json() as Promise<T>;
}

export async function getList(
  path: string,
  params: Record<string, string> = {},
): Promise<TmdbItem[]> {
  const data = await tmdb<PagedResponse>(path, params);
  return data.results.filter((item) => item.poster_path || item.backdrop_path);
}

export async function getDetails(
  type: MediaType,
  id: number | string,
): Promise<TmdbDetails> {
  return tmdb<TmdbDetails>(`/${type}/${id}`, {
    append_to_response: "videos,credits,similar,recommendations",
  });
}

/**
 * One season's episode list. TMDB only returns episodes from the per-season
 * endpoint — the `/tv/{id}` payload just summarises the seasons.
 */
export async function getSeason(
  id: number | string,
  seasonNumber: number,
): Promise<TmdbSeason> {
  return tmdb<TmdbSeason>(`/tv/${id}/season/${seasonNumber}`);
}

/**
 * IMDb id for a title, used by keyless third-party servers that index by
 * IMDb (SuperEmbed-style JSON APIs) rather than by TMDB id. Returns null
 * when TMDB has no mapping or the lookup fails — callers fall back to
 * whatever else they can key on.
 */
export async function getImdbId(
  type: MediaType,
  id: number | string,
): Promise<string | null> {
  try {
    const data = await tmdb<{ imdb_id?: string | null }>(
      `/${type}/${id}/external_ids`,
    );
    return data.imdb_id ?? null;
  } catch (error) {
    console.warn(`Could not resolve IMDb id for ${type}/${id}`, error);
    return null;
  }
}

export async function search(query: string): Promise<TmdbItem[]> {
  if (!query.trim()) return [];
  const data = await tmdb<PagedResponse>("/search/multi", { query });
  return data.results.filter(
    (item) =>
      item.media_type !== "person" && (item.poster_path || item.backdrop_path),
  );
}

/** Picks the best YouTube trailer from a TMDB videos payload. */
export function pickTrailer(videos: TmdbVideo[] | undefined): string | null {
  if (!videos?.length) return null;
  const youtube = videos.filter((v) => v.site === "YouTube");
  const byPreference =
    youtube.find((v) => v.type === "Trailer" && v.official) ??
    youtube.find((v) => v.type === "Trailer") ??
    youtube.find((v) => v.type === "Teaser") ??
    youtube[0];
  return byPreference?.key ?? null;
}

export function imageUrl(
  path: string | null | undefined,
  size: string,
): string | null {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

export const posterUrl = (path: string | null | undefined) =>
  imageUrl(path, "w500");
export const backdropUrl = (path: string | null | undefined) =>
  imageUrl(path, "original");
export const thumbUrl = (path: string | null | undefined) =>
  imageUrl(path, "w780");
export const profileUrl = (path: string | null | undefined) =>
  imageUrl(path, "w185");
export const stillUrl = (path: string | null | undefined) =>
  imageUrl(path, "w300");

export function getTitle(item: TmdbItem): string {
  return item.title ?? item.name ?? "Untitled";
}

export function getYear(item: TmdbItem): string {
  const date = item.release_date ?? item.first_air_date;
  return date ? date.slice(0, 4) : "";
}

/** TMDB `media_type` is only present on trending/search results. */
export function getMediaType(item: TmdbItem): MediaType {
  if (item.media_type === "movie" || item.media_type === "tv") {
    return item.media_type;
  }
  return item.title || item.release_date ? "movie" : "tv";
}

export interface RowConfig {
  id: string;
  title: string;
  path: string;
  params?: Record<string, string>;
}

const ANIMATION_GENRE_ID = 16;

/** Discover filters that keep low-effort and unrated entries out of the rows. */
const QUALITY_MOVIE = { "vote_count.gte": "150", sort_by: "popularity.desc" };
const QUALITY_TV = { "vote_count.gte": "20", sort_by: "popularity.desc" };

/**
 * A browsable section of the catalogue. Each slug maps to exactly ONE TMDB
 * media type: movie and TV ids overlap (1399 is both a film and Game of
 * Thrones), so the slug alone has to say which endpoint to read.
 */
export interface CategoryConfig {
  slug: string;
  label: string;
  mediaType: MediaType;
  rows: RowConfig[];
}

export const CATEGORIES: CategoryConfig[] = [
  {
    slug: "movies",
    label: "Movies",
    mediaType: "movie",
    rows: [
      { id: "m-trending", title: "Trending Movies", path: "/trending/movie/week" },
      { id: "m-now", title: "Now Playing", path: "/movie/now_playing" },
      { id: "m-popular", title: "Popular Movies", path: "/movie/popular" },
      { id: "m-top", title: "Top Rated Movies", path: "/movie/top_rated" },
      { id: "m-upcoming", title: "Coming Soon", path: "/movie/upcoming" },
      {
        id: "m-scifi",
        title: "Sci-Fi & Fantasy",
        path: "/discover/movie",
        params: { ...QUALITY_MOVIE, with_genres: "878,14" },
      },
      {
        id: "m-action",
        title: "Action Thrillers",
        path: "/discover/movie",
        params: { ...QUALITY_MOVIE, with_genres: "28,53" },
      },
    ],
  },
  {
    slug: "tv-shows",
    label: "TV Shows",
    mediaType: "tv",
    rows: [
      { id: "t-trending", title: "Trending Series", path: "/trending/tv/week" },
      {
        id: "t-originals",
        title: "Netflix Originals",
        path: "/discover/tv",
        params: { with_networks: "213" },
      },
      { id: "t-popular", title: "Popular Series", path: "/tv/popular" },
      { id: "t-top", title: "Top Rated Series", path: "/tv/top_rated" },
      { id: "t-today", title: "Airing Today", path: "/tv/airing_today" },
      {
        id: "t-drama",
        title: "Drama Series",
        path: "/discover/tv",
        params: { ...QUALITY_TV, with_genres: "18" },
      },
      {
        id: "t-crime",
        title: "Crime Series",
        path: "/discover/tv",
        params: { ...QUALITY_TV, with_genres: "80" },
      },
    ],
  },
  {
    slug: "anime",
    label: "Anime",
    mediaType: "tv",
    rows: [
      {
        id: "a-popular",
        title: "Popular Anime",
        path: "/discover/tv",
        params: {
          ...QUALITY_TV,
          with_genres: String(ANIMATION_GENRE_ID),
          with_original_language: "ja",
          "vote_count.gte": "200",
        },
      },
      {
        id: "a-top",
        title: "Top Rated Anime",
        path: "/discover/tv",
        params: {
          with_genres: String(ANIMATION_GENRE_ID),
          with_original_language: "ja",
          sort_by: "vote_average.desc",
          "vote_count.gte": "500",
        },
      },
      {
        id: "a-airing",
        title: "Airing Now",
        path: "/discover/tv",
        params: {
          with_genres: String(ANIMATION_GENRE_ID),
          with_original_language: "ja",
          sort_by: "popularity.desc",
          "vote_count.gte": "50",
          with_status: "0",
        },
      },
    ],
  },
  {
    slug: "anime-movies",
    label: "Anime Films",
    mediaType: "movie",
    rows: [
      {
        id: "am-popular",
        title: "Popular Anime Films",
        path: "/discover/movie",
        params: {
          with_genres: String(ANIMATION_GENRE_ID),
          with_original_language: "ja",
          sort_by: "popularity.desc",
          "vote_count.gte": "200",
        },
      },
      {
        id: "am-top",
        title: "Top Rated Anime Films",
        path: "/discover/movie",
        params: {
          with_genres: String(ANIMATION_GENRE_ID),
          with_original_language: "ja",
          sort_by: "vote_average.desc",
          "vote_count.gte": "500",
        },
      },
    ],
  },
  {
    slug: "hindi-movies",
    label: "Hindi Movies",
    mediaType: "movie",
    rows: [
      {
        id: "h-popular",
        title: "Popular Hindi Movies",
        path: "/discover/movie",
        params: { ...QUALITY_MOVIE, with_original_language: "hi" },
      },
      {
        id: "h-top",
        title: "Top Rated Hindi Movies",
        path: "/discover/movie",
        params: {
          with_original_language: "hi",
          sort_by: "vote_average.desc",
          "vote_count.gte": "300",
        },
      },
      {
        id: "h-recent",
        title: "New Hindi Releases",
        path: "/discover/movie",
        params: {
          with_original_language: "hi",
          sort_by: "primary_release_date.desc",
          "vote_count.gte": "20",
          "primary_release_date.lte": new Date().toISOString().slice(0, 10),
        },
      },
      {
        id: "h-action",
        title: "Hindi Action & Thrillers",
        path: "/discover/movie",
        params: {
          with_original_language: "hi",
          with_genres: "28,53",
          sort_by: "popularity.desc",
          "vote_count.gte": "50",
        },
      },
      {
        id: "h-romance",
        title: "Hindi Romance & Drama",
        path: "/discover/movie",
        params: {
          with_original_language: "hi",
          with_genres: "10749,18",
          sort_by: "popularity.desc",
          "vote_count.gte": "50",
        },
      },
    ],
  },
  {
    slug: "hindi-tv-shows",
    label: "Hindi TV Shows",
    mediaType: "tv",
    rows: [
      {
        id: "ht-popular",
        title: "Popular Hindi Series",
        path: "/discover/tv",
        params: { ...QUALITY_TV, with_original_language: "hi" },
      },
      {
        id: "ht-top",
        title: "Top Rated Hindi Series",
        path: "/discover/tv",
        params: {
          with_original_language: "hi",
          sort_by: "vote_average.desc",
          "vote_count.gte": "40",
        },
      },
    ],
  },
];

export function getCategory(slug: string): CategoryConfig | undefined {
  return CATEGORIES.find((category) => category.slug === slug);
}

/**
 * Which category page a title belongs to. Always type-accurate, because the
 * detail route reads the TMDB endpoint straight off the slug.
 */
export function getCategorySlug(item: TmdbItem): string {
  const type = getMediaType(item);
  const language = item.original_language;
  const isAnimated = item.genre_ids?.includes(ANIMATION_GENRE_ID) ?? false;

  if (language === "hi") {
    return type === "movie" ? "hindi-movies" : "hindi-tv-shows";
  }
  if (language === "ja" && isAnimated) {
    return type === "movie" ? "anime-movies" : "anime";
  }
  return type === "movie" ? "movies" : "tv-shows";
}

/** Shape consumed by the cards on the client. */
export interface CardItem {
  id: number;
  title: string;
  mediaType: MediaType;
  category: string;
  image: string | null;
  year: string;
  rating: number | null;
  overview: string;
}

export function toCardItem(item: TmdbItem): CardItem {
  return {
    id: item.id,
    title: getTitle(item),
    mediaType: getMediaType(item),
    category: getCategorySlug(item),
    image: thumbUrl(item.backdrop_path ?? item.poster_path),
    year: getYear(item),
    rating: item.vote_average ? Math.round(item.vote_average * 10) : null,
    overview: item.overview ?? "",
  };
}

/**
 * Titles to suggest next to the one being viewed. TMDB's `recommendations` are
 * better curated than `similar`, so those lead and `similar` only fills gaps.
 */
export function pickRelated(details: TmdbDetails, limit = 12): TmdbItem[] {
  return [
    ...(details.recommendations?.results ?? []),
    ...(details.similar?.results ?? []),
  ]
    .filter((item) => item.poster_path || item.backdrop_path)
    .filter(
      (item, index, all) => all.findIndex((x) => x.id === item.id) === index,
    )
    .slice(0, limit);
}

/** The home page rows, in display order. */
export const HOME_ROWS: RowConfig[] = [
  { id: "trending", title: "Trending Now", path: "/trending/all/week" },
  {
    id: "originals",
    title: "Netflix Originals",
    path: "/discover/tv",
    params: { with_networks: "213" },
  },
  {
    id: "hindi",
    title: "Popular Hindi Movies",
    path: "/discover/movie",
    params: { ...QUALITY_MOVIE, with_original_language: "hi" },
  },
  { id: "top-rated", title: "Top Rated", path: "/movie/top_rated" },
  {
    id: "anime",
    title: "Anime",
    path: "/discover/tv",
    params: {
      with_genres: String(ANIMATION_GENRE_ID),
      with_original_language: "ja",
      sort_by: "popularity.desc",
      "vote_count.gte": "200",
    },
  },
  {
    id: "hindi-action",
    title: "Hindi Action & Thrillers",
    path: "/discover/movie",
    params: {
      with_original_language: "hi",
      with_genres: "28,53",
      sort_by: "popularity.desc",
      "vote_count.gte": "50",
    },
  },
  {
    id: "action",
    title: "Action Thrillers",
    path: "/discover/movie",
    params: { ...QUALITY_MOVIE, with_genres: "28" },
  },
  {
    id: "comedy",
    title: "Comedies",
    path: "/discover/movie",
    params: { ...QUALITY_MOVIE, with_genres: "35" },
  },
  {
    id: "hindi-tv",
    title: "Hindi TV Shows",
    path: "/discover/tv",
    params: { ...QUALITY_TV, with_original_language: "hi" },
  },
  {
    id: "horror",
    title: "Horror Movies",
    path: "/discover/movie",
    params: { ...QUALITY_MOVIE, with_genres: "27" },
  },
  {
    id: "romance",
    title: "Romance Movies",
    path: "/discover/movie",
    params: { ...QUALITY_MOVIE, with_genres: "10749" },
  },
  {
    id: "documentaries",
    title: "Documentaries",
    path: "/discover/movie",
    params: { ...QUALITY_MOVIE, with_genres: "99" },
  },
];
