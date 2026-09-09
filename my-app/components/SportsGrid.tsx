import SportsMatchCard from "@/components/SportsMatchCard";
import type { SportsMatch } from "@/lib/sports";

/** A titled block of fixtures; renders nothing when there are none. */
export default function SportsGrid({
  title,
  matches,
  accent = false,
  empty,
}: {
  title: string;
  matches: SportsMatch[];
  /** Marks the heading as live, with a pulsing dot. */
  accent?: boolean;
  /** Shown in place of the grid when `matches` is empty. */
  empty?: string;
}) {
  if (!matches.length && !empty) return null;

  return (
    <section className="mt-10 first:mt-0">
      <div className="mb-5 flex items-center gap-3">
        <span
          aria-hidden
          className={
            accent
              ? "h-6 w-1 rounded-full bg-brand"
              : "h-6 w-1 rounded-full bg-gradient-to-b from-brand-bright to-brand-deep"
          }
        />
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-wide text-white md:text-xl">
          {title}
          {accent ? (
            <span
              aria-hidden
              className="h-2 w-2 animate-pulse rounded-full bg-brand"
            />
          ) : null}
        </h2>
        {matches.length ? (
          <span className="text-xs font-semibold text-neutral-500">
            {matches.length}
          </span>
        ) : null}
      </div>

      {matches.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {matches.map((match) => (
            <SportsMatchCard key={match.id} match={match} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-neutral-400">
          {empty}
        </p>
      )}
    </section>
  );
}
