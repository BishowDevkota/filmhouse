import Link from "next/link";
import { sportIcon, type SportCategory } from "@/lib/sports";

/** Sport chips: "All" plus one per category, linking to /sports/{id}. */
export default function SportsNav({
  sports,
  active,
}: {
  sports: SportCategory[];
  /** Active sport id, or undefined on the "All" hub. */
  active?: string;
}) {
  const chips = [{ id: "", name: "All Sports" }, ...sports];

  return (
    <nav
      aria-label="Sports"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-wrap md:px-0"
    >
      {chips.map((sport) => {
        const selected = (active ?? "") === sport.id;
        return (
          <Link
            key={sport.id || "all"}
            href={sport.id ? `/sports/${sport.id}` : "/sports"}
            aria-current={selected ? "page" : undefined}
            className={[
              "flex flex-none items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-wide whitespace-nowrap transition",
              selected
                ? "border-brand bg-brand/20 text-white shadow-[0_0_20px_-6px_rgba(235,18,24,0.7)]"
                : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/25 hover:text-white",
            ].join(" ")}
          >
            {sport.id ? <span aria-hidden>{sportIcon(sport.id)}</span> : null}
            {sport.name}
          </Link>
        );
      })}
    </nav>
  );
}
