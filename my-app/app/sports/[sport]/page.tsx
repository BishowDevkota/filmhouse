import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SportsGrid from "@/components/SportsGrid";
import SportsNav from "@/components/SportsNav";
import { getMatches, getSports, isLive, sportIcon } from "@/lib/sports";

export const revalidate = 60;

async function findSport(id: string) {
  const sports = await getSports();
  return {
    sports,
    sport: sports.find((entry) => entry.id === id) ?? null,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sport: string }>;
}): Promise<Metadata> {
  const { sport: id } = await params;
  const { sport } = await findSport(id);
  if (!sport) return { title: "Not found — Filmhouse TV" };
  return {
    title: `${sport.name} Live Streams — Filmhouse TV`,
    description: `Live and upcoming ${sport.name.toLowerCase()} matches, with multiple streams for every fixture.`,
  };
}

export default async function SportPage({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport: id } = await params;
  const { sports, sport } = await findSport(id);
  if (!sport) notFound();

  const matches = await getMatches(sport.id);
  const live = matches.filter((match) => isLive(match));
  const upcoming = matches.filter((match) => !isLive(match));

  return (
    <div className="min-h-screen bg-black px-4 pt-24 pb-16 md:px-12 md:pt-28">
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-8">
          <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            <span aria-hidden>{sportIcon(sport.id)}</span>
            {sport.name}
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            {matches.length
              ? `${live.length} live now · ${upcoming.length} upcoming`
              : "No fixtures listed right now."}
          </p>
        </header>

        <SportsNav sports={sports} active={sport.id} />

        <div className="mt-8">
          <SportsGrid title="Live Now" matches={live} accent />
          <SportsGrid
            title="Upcoming"
            matches={upcoming}
            empty={`No ${sport.name.toLowerCase()} fixtures scheduled at the moment.`}
          />
        </div>
      </div>
    </div>
  );
}
