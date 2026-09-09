import Link from "next/link";
import KickoffTime from "@/components/KickoffTime";
import { isLive, sportIcon, type SportsMatch } from "@/lib/sports";

/** The two crests facing off, used when a fixture has no poster art. */
function BadgeFace({ match }: { match: SportsMatch }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-4 bg-gradient-to-br from-neutral-900 via-black to-neutral-900 px-4">
      {[match.home, match.away].map((team, index) =>
        team?.badge ? (
          <img
            key={`${team.name}-${index}`}
            src={team.badge}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className="h-12 w-12 object-contain drop-shadow-lg sm:h-14 sm:w-14"
          />
        ) : (
          <span
            key={`icon-${index}`}
            aria-hidden
            className="text-3xl opacity-40"
          >
            {sportIcon(match.sport)}
          </span>
        ),
      )}
    </div>
  );
}

/** Links to /sports/{sport}/{matchId}. */
export default function SportsMatchCard({ match }: { match: SportsMatch }) {
  const live = isLive(match);

  return (
    <Link
      href={`/sports/${match.sport}/${match.id}`}
      className="group relative w-full text-left transition-transform duration-300 ease-out hover:z-20 hover:scale-[1.03] focus-visible:z-20 focus-visible:scale-[1.03] focus:outline-none"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/10 transition group-hover:ring-2 group-hover:ring-brand group-focus-visible:ring-2 group-focus-visible:ring-brand">
        {match.poster ? (
          <img
            src={match.poster}
            alt={match.title}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <BadgeFace match={match} />
        )}

        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent" />

        {live ? (
          <span className="absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-brand px-2 py-0.5 text-[10px] font-bold tracking-[0.16em] text-white uppercase shadow-lg">
            <span
              aria-hidden
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-white"
            />
            Live
          </span>
        ) : match.date ? (
          <KickoffTime
            date={match.date}
            className="absolute top-2 left-2 rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-neutral-200 backdrop-blur"
          />
        ) : null}

        {match.popular ? (
          <span className="absolute top-2 right-2 rounded-md border border-white/20 bg-black/60 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-brand-bright uppercase backdrop-blur">
            Popular
          </span>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="truncate text-sm font-semibold text-white">
            {match.title}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-neutral-400">
            <span aria-hidden>{sportIcon(match.sport)}</span>
            <span className="truncate capitalize">
              {match.sport.replace(/-/g, " ")}
            </span>
          </p>
        </div>
      </div>
    </Link>
  );
}
