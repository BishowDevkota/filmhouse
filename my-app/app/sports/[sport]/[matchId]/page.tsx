import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import KickoffTime from "@/components/KickoffTime";
import SportsGrid from "@/components/SportsGrid";
import WatchServerPlayer from "@/components/WatchServerPlayer";
import {
  getMatch,
  getMatches,
  getMatchServers,
  isLive,
  sportIcon,
  type SportsMatch,
  type SportsTeam,
} from "@/lib/sports";
import { SITE_NAME, absoluteUrl, jsonLd } from "@/lib/site";

/**
 * The player for one fixture.
 *
 * Streams for a live game appear and die inside the hour, so this page is
 * revalidated aggressively — a cached "no servers" from before kickoff would
 * otherwise outlive the match itself.
 */
export const revalidate = 30;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sport: string; matchId: string }>;
}): Promise<Metadata> {
  const { sport, matchId } = await params;
  const match = await getMatch(sport, matchId);
  if (!match) return { title: "Not found", robots: { index: false } };

  const title = `${match.title} — Live Stream`;
  const description = `Watch ${match.title} live on ${SITE_NAME}. Multiple streams, no signup.`;

  return {
    title,
    description,
    alternates: { canonical: `/sports/${sport}/${matchId}` },
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description,
      url: `/sports/${sport}/${matchId}`,
      type: "video.other",
      images: match.poster ? [{ url: match.poster, alt: match.title }] : undefined,
    },
  };
}

/**
 * SportsEvent structured data. A fixture is an event with a start time and two
 * competitors, and saying so is what lets it surface in Google's sports and
 * event results rather than as a plain page.
 */
function matchLd(match: SportsMatch, path: string) {
  const competitors = [match.home, match.away]
    .filter((team): team is SportsTeam => Boolean(team))
    .map((team) => ({
      "@type": "SportsTeam",
      name: team.name,
      logo: team.badge ?? undefined,
    }));

  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: match.title,
    url: absoluteUrl(path),
    startDate: new Date(match.date).toISOString(),
    eventStatus: "https://schema.org/EventScheduled",
    // The fixture is played somewhere physical, but the thing being offered
    // here is the stream, so the location is the watch page itself.
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    location: {
      "@type": "VirtualLocation",
      url: absoluteUrl(path),
    },
    image: match.poster ?? undefined,
    sport: match.sport.replace(/-/g, " "),
    competitor: competitors.length ? competitors : undefined,
    isAccessibleForFree: true,
  };
}

/** One team's crest and name, sized for the header row. */
function TeamBlock({
  team,
  align,
}: {
  team: SportsTeam | null;
  align: "left" | "right";
}) {
  if (!team) return null;
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-3 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      {team.badge ? (
        <img
          src={team.badge}
          alt=""
          aria-hidden
          className="h-10 w-10 flex-none object-contain sm:h-14 sm:w-14"
        />
      ) : null}
      <span className="truncate text-base font-bold text-white sm:text-xl">
        {team.name}
      </span>
    </div>
  );
}

/** Crests either side of a "VS", falling back to the plain title. */
function MatchHeading({ match }: { match: SportsMatch }) {
  if (!match.home || !match.away) {
    return (
      <h1 className="text-shadow-hero text-2xl font-extrabold tracking-tight text-white sm:text-3xl lg:text-4xl">
        {match.title}
      </h1>
    );
  }

  return (
    <h1 className="flex items-center gap-3 sm:gap-6">
      <TeamBlock team={match.home} align="left" />
      <span
        aria-hidden
        className="flex-none text-sm font-bold tracking-[0.2em] text-neutral-500"
      >
        VS
      </span>
      <TeamBlock team={match.away} align="right" />
    </h1>
  );
}

export default async function SportsWatchPage({
  params,
}: {
  params: Promise<{ sport: string; matchId: string }>;
}) {
  const { sport, matchId } = await params;
  const match = await getMatch(sport, matchId);
  if (!match) notFound();

  const [servers, sameSport] = await Promise.all([
    getMatchServers(match),
    getMatches(match.sport),
  ]);

  const live = isLive(match);
  const playable = servers.some((server) => server.enabled);
  const more = sameSport.filter((entry) => entry.id !== match.id).slice(0, 8);

  return (
    <div className="relative min-h-screen bg-black pt-16 pb-16 md:pt-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(matchLd(match, `/sports/${sport}/${matchId}`))}
      />

      <div className="relative px-4 md:px-12">
        <div
          className="mx-auto w-full"
          style={{ maxWidth: "min(1600px, calc(76vh * 16 / 9))" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <Link
              href={`/sports/${match.sport}`}
              className="group flex items-center gap-2 text-sm font-medium text-neutral-300 transition hover:text-brand"
            >
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 transition group-hover:border-brand/60 group-hover:bg-brand/10"
              >
                ←
              </span>
              <span className="capitalize">
                Back to {match.sport.replace(/-/g, " ")}
              </span>
            </Link>

            <span
              className={[
                "flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold tracking-[0.18em] uppercase",
                live
                  ? "border-brand/40 bg-brand/15 text-brand-bright"
                  : "border-white/15 bg-white/5 text-neutral-300",
              ].join(" ")}
            >
              <span
                aria-hidden
                className={
                  live
                    ? "h-1.5 w-1.5 animate-pulse rounded-full bg-brand"
                    : "h-1.5 w-1.5 rounded-full bg-neutral-500"
                }
              />
              {live ? "Live Now" : "Upcoming"}
            </span>
          </div>

          <header className="mt-4">
            <MatchHeading match={match} />
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-400">
              <span className="flex items-center gap-1.5 capitalize">
                <span aria-hidden>{sportIcon(match.sport)}</span>
                {match.sport.replace(/-/g, " ")}
              </span>
              {match.date ? (
                <>
                  <span aria-hidden className="text-neutral-600">
                    •
                  </span>
                  <KickoffTime date={match.date} />
                </>
              ) : null}
            </p>
          </header>

          <div className="mt-6">
            <WatchServerPlayer
              title={match.title}
              servers={servers}
              trailerKey={null}
              legacy={null}
            />
          </div>

          {playable ? null : (
            <p className="mt-4 rounded-xl border border-brand/40 bg-brand/10 px-4 py-2.5 text-xs text-brand-bright">
              {live
                ? "No stream is up for this game yet — providers usually publish one a few minutes after kickoff. Refresh shortly."
                : "Streams go live around kickoff. Come back when the game starts."}
            </p>
          )}

          {more.length ? (
            <div className="mt-12">
              <SportsGrid
                title={`More ${match.sport.replace(/-/g, " ")}`}
                matches={more}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
