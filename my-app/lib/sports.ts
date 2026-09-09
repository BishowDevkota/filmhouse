import type { WatchServer } from "@/lib/streaming";

/**
 * Live sports — schedules and per-match stream servers.
 *
 * Sports don't behave like the TMDB catalogue. A match is a short-lived event,
 * every provider invents its own id for it, and a stream only exists while the
 * game is actually on. So rather than one keyed lookup there is a *schedule*
 * provider and several *stream* providers, joined on the fixture title:
 *
 *   Streamed      schedule backbone + streams — keyless
 *   EmbedSportex  extra streams, joined by title — keyless
 *   SportSRC      streams for a match — needs a free key (SPORTSRC_API_KEY)
 *   Stream Den    embed page — URL template (STREAMDEN_EMBED_URL)
 *   VenueVault    embed page — URL template (VENUEVAULT_EMBED_URL)
 *
 * Whatever a provider hands back is flattened into a plain WatchServer, so the
 * sports player *is* the <WatchServerPlayer> the movie pages already use — the
 * server bar, fullscreen and the VAST pre-roll all come along unchanged.
 *
 * Every provider is optional and every lookup is failure-tolerant: a host that
 * is down, rate-limited or has changed shape drops its servers and leaves the
 * rest of the page working.
 */

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

const STREAMED_BASE = trimSlash(
  process.env.STREAMED_BASE_URL ?? "https://streamed.pk",
);
const ESPORTEX_BASE = trimSlash(
  process.env.EMBEDSPORTEX_BASE_URL ?? "https://api.esportex.site",
);
const SPORTSRC_BASE = trimSlash(
  process.env.SPORTSRC_BASE_URL ?? "https://api.sportsrc.org/v2",
);
/** SportSRC is the one provider that gates its match data behind a signup. */
const SPORTSRC_KEY = process.env.SPORTSRC_API_KEY?.trim() ?? "";

/**
 * Stream Den and VenueVault publish no documented API, so they are wired as
 * URL *templates* instead of hard-coded paths — set the env var to that site's
 * embed URL with {slug}, {id}, {title} or {sport} in it and the server lights
 * up without a code change. Both hosts were unreachable when this was written
 * (Stream Den 503, VenueVault 522), which is exactly why nothing is guessed.
 */
const STREAMDEN_TEMPLATE = process.env.STREAMDEN_EMBED_URL?.trim() ?? "";
const VENUEVAULT_TEMPLATE = process.env.VENUEVAULT_EMBED_URL?.trim() ?? "";

const TIMEOUT_MS = 9000;
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Fixture lists shift slowly; a live stream can appear or die mid-game. */
const SCHEDULE_TTL = 120;
const STREAM_TTL = 30;

/**
 * Fallback liveness window, used only when Streamed's own live endpoint is
 * unreachable. Generous on purpose: baseball and cricket routinely run past
 * four hours and Streamed keeps listing them.
 */
const LIVE_WINDOW_MS = 5 * 60 * 60 * 1000;

/** How far apart two providers' kickoff times may be and still be one game. */
const FIXTURE_WINDOW_MS = 3 * 60 * 60 * 1000;

export interface SportCategory {
  id: string;
  name: string;
}

export interface SportsTeam {
  name: string;
  /** Absolute badge URL, or null when the provider has no crest. */
  badge: string | null;
}

export interface SportsMatch {
  /** Streamed's slug id, e.g. "aek-athens-vs-lask-2594650". */
  id: string;
  title: string;
  /** Sport category id, e.g. "football" — matches SportCategory.id. */
  sport: string;
  /** Kickoff as epoch milliseconds. */
  date: number;
  popular: boolean;
  /** Streamed's own verdict: it is showing this game right now. */
  live: boolean;
  poster: string | null;
  home: SportsTeam | null;
  away: SportsTeam | null;
  /** Streamed's per-source handles, resolved to embeds on the watch page. */
  sources: { source: string; id: string }[];
}

/**
 * Shown when Streamed itself is unreachable, so the sport nav still renders
 * instead of collapsing to an empty page.
 */
const FALLBACK_SPORTS: SportCategory[] = [
  { id: "football", name: "Football" },
  { id: "basketball", name: "Basketball" },
  { id: "american-football", name: "American Football" },
  { id: "fight", name: "Fight (UFC, Boxing)" },
  { id: "cricket", name: "Cricket" },
  { id: "tennis", name: "Tennis" },
  { id: "hockey", name: "Hockey" },
  { id: "baseball", name: "Baseball" },
  { id: "motor-sports", name: "Motor Sports" },
  { id: "rugby", name: "Rugby" },
  { id: "golf", name: "Golf" },
  { id: "other", name: "Other" },
];

/** Decorative only — sports without an entry fall back to a generic marker. */
const SPORT_ICON: Record<string, string> = {
  football: "⚽",
  basketball: "🏀",
  "american-football": "🏈",
  hockey: "🏒",
  baseball: "⚾",
  "motor-sports": "🏎️",
  fight: "🥊",
  tennis: "🎾",
  rugby: "🏉",
  golf: "⛳",
  billiards: "🎱",
  afl: "🏉",
  darts: "🎯",
  cricket: "🏏",
  other: "🏅",
};

export function sportIcon(sport: string): string {
  return SPORT_ICON[sport] ?? "🏅";
}

/**
 * Whether the game is on air. Streamed publishes this directly and its answer
 * wins — a match can still be listed live hours after kickoff, which no clock
 * arithmetic here would get right. The window is only a fallback for when that
 * endpoint fails.
 */
export function isLive(match: SportsMatch, now = Date.now()): boolean {
  if (match.live) return true;
  return match.date > 0 && match.date <= now && now - match.date < LIVE_WINDOW_MS;
}

/**
 * One tolerant JSON GET. Any failure — DNS, timeout, 5xx, malformed body —
 * resolves to null so a dead provider can never take a page down with it.
 */
async function getJson<T>(
  url: string,
  revalidate: number,
  headers: Record<string, string> = {},
): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": BROWSER_UA,
        ...headers,
      },
      next: { revalidate },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 *  Fixture matching
 *
 *  Providers name the same game differently ("AEK Athens vs LASK" vs
 *  "AEK Athens vs LASK Linz"), so joining them is a fuzzy comparison of
 *  the two sides plus a sanity check on kickoff time.
 * ------------------------------------------------------------------ */

/** Club-name filler that carries no identifying signal on its own. */
const NOISE = new Set(["fc", "cf", "afc", "sc", "ac", "cd", "club", "the"]);

function tokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !NOISE.has(token));
}

/** Split "A vs B" into its two sides; null for a title with no "vs". */
function sides(title: string): [string[], string[]] | null {
  const parts = title.split(/\s+(?:vs\.?|v\.?|@)\s+/i);
  if (parts.length !== 2) return null;
  const [home, away] = [tokens(parts[0]), tokens(parts[1])];
  return home.length && away.length ? [home, away] : null;
}

/**
 * Providers abbreviate ("Man United" for "Manchester United"), so a token also
 * counts when one is a prefix of the other. The 3-character floor keeps short
 * words from colliding with everything.
 */
function tokenHit(token: string, pool: string[]): boolean {
  return pool.some(
    (other) =>
      other === token ||
      (token.length >= 3 && other.startsWith(token)) ||
      (other.length >= 3 && token.startsWith(other)),
  );
}

/** Share of the shorter side's words that turn up in the longer one. */
function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  return small.filter((token) => tokenHit(token, large)).length / small.length;
}

/**
 * Both club names have to survive, and by more than half: "Manchester United"
 * and "Manchester City" share exactly one word of two, and treating that as a
 * match would put the wrong game behind the play button.
 */
const SIDE_THRESHOLD = 0.67;
const TITLE_THRESHOLD = 0.6;

/**
 * Whether two provider titles name the same fixture. Both sides have to line
 * up, which is what stops "Arsenal vs Chelsea" matching "Arsenal vs Spurs".
 */
export function sameFixture(a: string, b: string): boolean {
  const left = sides(a);
  const right = sides(b);
  if (left && right) {
    const straight = Math.min(
      overlap(left[0], right[0]),
      overlap(left[1], right[1]),
    );
    // Providers disagree about which team is listed "home"; the kickoff-time
    // guard at the call site is what keeps the reverse leg from matching.
    const flipped = Math.min(
      overlap(left[0], right[1]),
      overlap(left[1], right[0]),
    );
    return Math.max(straight, flipped) >= SIDE_THRESHOLD;
  }
  // Single-name events (a race, a fight card) have no sides to compare.
  return overlap(tokens(a), tokens(b)) >= TITLE_THRESHOLD;
}

/* ------------------------------------------------------------------ *
 *  Streamed — the schedule backbone
 * ------------------------------------------------------------------ */

interface StreamedTeam {
  name?: string | null;
  badge?: string | null;
}

interface StreamedMatch {
  id?: string;
  title?: string;
  category?: string;
  date?: number;
  popular?: boolean;
  poster?: string | null;
  teams?: { home?: StreamedTeam | null; away?: StreamedTeam | null } | null;
  sources?: { source?: string; id?: string }[] | null;
}

interface StreamedStream {
  streamNo?: number;
  language?: string;
  hd?: boolean;
  embedUrl?: string;
  source?: string;
}

/** Badges arrive as bare handles; posters as a path already rooted at /api. */
function streamedImage(path: string | null | undefined, kind: "badge" | "raw") {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return kind === "badge"
    ? `${STREAMED_BASE}/api/images/badge/${path}.webp`
    : `${STREAMED_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

function toTeam(team: StreamedTeam | null | undefined): SportsTeam | null {
  const name = team?.name?.trim();
  if (!name) return null;
  return { name, badge: streamedImage(team?.badge, "badge") };
}

function toMatch(raw: StreamedMatch, live: boolean): SportsMatch | null {
  const id = raw.id?.trim();
  const title = raw.title?.trim();
  if (!id || !title) return null;
  return {
    id,
    title,
    sport: raw.category?.trim() || "other",
    date: typeof raw.date === "number" ? raw.date : 0,
    popular: Boolean(raw.popular),
    live,
    poster: streamedImage(raw.poster, "raw"),
    home: toTeam(raw.teams?.home),
    away: toTeam(raw.teams?.away),
    sources: (raw.sources ?? []).flatMap((source) =>
      source?.source && source?.id
        ? [{ source: source.source, id: source.id }]
        : [],
    ),
  };
}

/** Live games first, then whatever starts soonest. */
function bySchedule(a: SportsMatch, b: SportsMatch): number {
  const now = Date.now();
  const liveA = isLive(a, now);
  const liveB = isLive(b, now);
  if (liveA !== liveB) return liveA ? -1 : 1;
  return a.date - b.date;
}

/** Raw live payload, shared by every lister through the fetch cache. */
async function fetchLive(): Promise<StreamedMatch[]> {
  const data = await getJson<StreamedMatch[]>(
    `${STREAMED_BASE}/api/matches/live`,
    STREAM_TTL,
  );
  return Array.isArray(data) ? data : [];
}

export async function getSports(): Promise<SportCategory[]> {
  const data = await getJson<SportCategory[]>(
    `${STREAMED_BASE}/api/sports`,
    SCHEDULE_TTL,
  );
  if (!Array.isArray(data) || !data.length) return FALLBACK_SPORTS;
  return data.filter((sport) => sport?.id && sport?.name);
}

/**
 * Fixtures for one sport, or today's card across every sport when `sport` is
 * omitted. Already sorted: live now, then next to start.
 */
export async function getMatches(sport?: string): Promise<SportsMatch[]> {
  const path = sport
    ? `/api/matches/${encodeURIComponent(sport)}`
    : "/api/matches/all-today";
  const [data, live] = await Promise.all([
    getJson<StreamedMatch[]>(`${STREAMED_BASE}${path}`, SCHEDULE_TTL),
    fetchLive(),
  ]);
  if (!Array.isArray(data)) return [];
  const liveIds = new Set(live.map((raw) => raw.id));
  return data
    .flatMap((raw) => {
      const match = toMatch(raw, liveIds.has(raw.id));
      return match ? [match] : [];
    })
    .sort(bySchedule);
}

export async function getLiveMatches(): Promise<SportsMatch[]> {
  return (await fetchLive())
    .flatMap((raw) => {
      const match = toMatch(raw, true);
      return match ? [match] : [];
    })
    .sort(bySchedule);
}

/**
 * One fixture by id. Checked against its own sport first, then today's full
 * card, since a match can be re-categorised between the list and the click.
 */
export async function getMatch(
  sport: string,
  id: string,
): Promise<SportsMatch | null> {
  const bySport = await getMatches(sport);
  const hit = bySport.find((match) => match.id === id);
  if (hit) return hit;
  const today = await getMatches();
  return today.find((match) => match.id === id) ?? null;
}

/* ------------------------------------------------------------------ *
 *  Stream providers → WatchServer[]
 * ------------------------------------------------------------------ */

type ServerDraft = Omit<WatchServer, "number">;

/** Keeps one popular fixture from pushing 20 buttons into the server bar. */
const MAX_PER_PROVIDER = 6;

/** Streamed: every source handle expands into its own numbered streams. */
async function streamedServers(match: SportsMatch): Promise<ServerDraft[]> {
  const perSource = await Promise.all(
    match.sources.map((source) =>
      getJson<StreamedStream[]>(
        `${STREAMED_BASE}/api/stream/${encodeURIComponent(source.source)}/${encodeURIComponent(source.id)}`,
        STREAM_TTL,
      ),
    ),
  );

  const drafts: ServerDraft[] = [];
  for (const streams of perSource) {
    if (!Array.isArray(streams)) continue;
    for (const stream of streams) {
      if (!stream?.embedUrl) continue;
      // The raw source ids ("echo", "delta", "golf") mean nothing to a viewer,
      // so the button carries quality and language instead.
      const quality = stream.hd ? "HD" : "SD";
      const language = stream.language?.trim();
      drafts.push({
        provider: "Streamed",
        kind: "embed",
        kindLabel: language ? `${quality} · ${language}` : quality,
        url: stream.embedUrl,
        enabled: true,
      });
    }
  }
  return drafts.slice(0, MAX_PER_PROVIDER);
}

interface EsportexIframe {
  server?: string;
  url?: string;
}

interface EsportexMatch {
  slug?: string;
  tag?: string;
  kickoff?: string;
  league?: string;
  poster?: string | null;
  iframes?: EsportexIframe[] | null;
}

/**
 * EmbedSportex publishes every sport in one payload, keyed by category, with
 * kickoff times in WIB (UTC+7) — parsed as such rather than as local time.
 */
function esportexKickoff(kickoff: string | undefined): number | null {
  if (!kickoff) return null;
  const parsed = Date.parse(`${kickoff.replace(" ", "T")}:00+07:00`);
  return Number.isNaN(parsed) ? null : parsed;
}

async function esportexServers(match: SportsMatch): Promise<ServerDraft[]> {
  const payload = await getJson<Record<string, unknown>>(
    `${ESPORTEX_BASE}/api/streams`,
    STREAM_TTL,
  );
  if (!payload) return [];

  const candidates = Object.values(payload).filter(
    (value): value is EsportexMatch[] => Array.isArray(value),
  );

  for (const list of candidates) {
    for (const entry of list) {
      const tag = entry?.tag?.trim();
      if (!tag || !sameFixture(match.title, tag)) continue;
      // Titles repeat across seasons, so a fixture only counts when it also
      // kicks off around the same time.
      const kickoff = esportexKickoff(entry.kickoff);
      if (kickoff && match.date && Math.abs(kickoff - match.date) > FIXTURE_WINDOW_MS) {
        continue;
      }
      const drafts = (entry.iframes ?? []).flatMap<ServerDraft>((iframe) =>
        iframe?.url
          ? [
              {
                provider: "EmbedSportex",
                kind: "embed",
                kindLabel: iframe.server?.trim() || "Embed",
                url: iframe.url,
                enabled: true,
              },
            ]
          : [],
      );
      if (drafts.length) return drafts.slice(0, MAX_PER_PROVIDER);
    }
  }
  return [];
}

/** Every absolute http(s) URL anywhere in a payload, in order, deduped. */
function collectHttpUrls(json: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value) && !seen.has(value)) {
        seen.add(value);
        found.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };

  walk(json);
  return found;
}

/** Images and API self-links are the two things a detail payload always has. */
const NOT_A_STREAM =
  /\.(png|jpe?g|webp|gif|svg|ico|css|js)(\?|#|$)|\/(api|cdn|static|assets|img|image|images|logo)\//i;

/**
 * SportSRC needs a free key, and its match ids are its own — so a fixture is
 * located by title in the day's list, then its detail payload is scanned for
 * embeddable URLs. The scan is deliberately shape-agnostic: the endpoint is
 * documented as returning "Streaming URLs" but the field names are not
 * published, and this cannot be verified without a key.
 */
async function sportsrcServers(match: SportsMatch): Promise<ServerDraft[]> {
  if (!SPORTSRC_KEY || !match.date) return [];
  const headers = { "X-API-KEY": SPORTSRC_KEY };
  const date = new Date(match.date).toISOString().slice(0, 10);

  const listing = await getJson<unknown>(
    `${SPORTSRC_BASE}/?type=matches&sport=${encodeURIComponent(match.sport)}&status=all&date=${date}`,
    SCHEDULE_TTL,
    headers,
  );
  const rows = Array.isArray((listing as { data?: unknown })?.data)
    ? ((listing as { data: Record<string, unknown>[] }).data)
    : [];

  const hit = rows.find((row) => {
    const title =
      typeof row.title === "string"
        ? row.title
        : typeof row.name === "string"
          ? row.name
          : [row.home_team, row.away_team].filter(Boolean).join(" vs ");
    return title ? sameFixture(match.title, String(title)) : false;
  });
  const id = hit?.id ?? hit?.match_id;
  if (id === undefined || id === null) return [];

  const detail = await getJson<unknown>(
    `${SPORTSRC_BASE}/?type=detail&id=${encodeURIComponent(String(id))}`,
    STREAM_TTL,
    headers,
  );
  if (!detail) return [];

  return collectHttpUrls(detail)
    .filter((url) => !NOT_A_STREAM.test(url))
    .slice(0, MAX_PER_PROVIDER)
    .map((url, index) => ({
      provider: "SportSRC",
      kind: "embed" as const,
      kindLabel: `Stream ${index + 1}`,
      url,
      enabled: true,
    }));
}

/** URL-template placeholders, so an undocumented host needs no code change. */
function fillTemplate(template: string, match: SportsMatch): string {
  const slug = match.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return template
    .replace(/\{slug\}/g, encodeURIComponent(slug))
    .replace(/\{id\}/g, encodeURIComponent(match.id))
    .replace(/\{title\}/g, encodeURIComponent(match.title))
    .replace(/\{sport\}/g, encodeURIComponent(match.sport));
}

/**
 * Stream Den and VenueVault. Both publish no API and were unreachable when
 * this shipped, so each stays a greyed-out button until its env var supplies
 * the embed URL — the same "not configured" treatment the movie servers use.
 */
function templateServers(match: SportsMatch): ServerDraft[] {
  return [
    {
      provider: "The Stream Den",
      template: STREAMDEN_TEMPLATE,
      setupEnv: "STREAMDEN_EMBED_URL",
    },
    {
      provider: "VenueVault",
      template: VENUEVAULT_TEMPLATE,
      setupEnv: "VENUEVAULT_EMBED_URL",
    },
  ].map(({ provider, template, setupEnv }) => ({
    provider,
    kind: "embed" as const,
    kindLabel: "Embed",
    url: template ? fillTemplate(template, match) : undefined,
    enabled: Boolean(template),
    setupEnv,
  }));
}

/**
 * Every playable server for one fixture, numbered for the server bar. The
 * providers are queried in parallel and a failing one simply contributes
 * nothing.
 */
export async function getMatchServers(
  match: SportsMatch,
): Promise<WatchServer[]> {
  const [streamed, esportex, sportsrc] = await Promise.all([
    streamedServers(match),
    esportexServers(match),
    sportsrcServers(match),
  ]);

  return [...streamed, ...esportex, ...sportsrc, ...templateServers(match)].map(
    (draft, index) => ({ ...draft, number: index + 1 }),
  );
}
