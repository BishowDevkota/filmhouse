import type { Metadata } from "next";
import SportsGrid from "@/components/SportsGrid";
import SportsNav from "@/components/SportsNav";
import { getLiveMatches, getMatches, getSports, isLive } from "@/lib/sports";

/** Fixture lists move on their own; don't serve a stale card for long. */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Live Sports — Filmhouse TV",
  description:
    "Live football, basketball, NFL, UFC, cricket and more — every game with multiple streams.",
};

export default async function SportsPage() {
  const [sports, live, today] = await Promise.all([
    getSports(),
    getLiveMatches(),
    getMatches(),
  ]);

  // "Today" is everything still to come; anything already running is shown
  // once, in the live block above it.
  const liveIds = new Set(live.map((match) => match.id));
  const upcoming = today.filter(
    (match) => !liveIds.has(match.id) && !isLive(match),
  );

  return (
    <div className="min-h-screen bg-black px-4 pt-24 pb-16 md:px-12 md:pt-28">
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Live <span className="text-gradient-brand">Sports</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            Football, basketball, NFL, UFC, cricket and more — every fixture
            carries several streams, so if one server stalls the next is a
            click away.
          </p>
        </header>

        <SportsNav sports={sports} />

        <div className="mt-8">
          <SportsGrid
            title="Live Now"
            matches={live}
            accent
            empty="Nothing kicking off right this second — check today's schedule below."
          />
          <SportsGrid
            title="Today's Schedule"
            matches={upcoming}
            empty="No fixtures listed for today. Pick a sport above to see its full card."
          />
        </div>
      </div>
    </div>
  );
}
