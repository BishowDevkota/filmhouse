import Link from "next/link";

export default function HeroActions({
  watchHref,
  infoHref,
  watchLabel,
}: {
  watchHref: string;
  infoHref: string;
  watchLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href={watchHref}
        className="flex items-center gap-2 rounded bg-brand px-6 py-2 font-semibold text-black transition hover:bg-brand-bright"
      >
        <span aria-hidden>▶</span>
        {watchLabel}
      </Link>
      <Link
        href={infoHref}
        className="flex items-center gap-2 rounded bg-neutral-500/70 px-6 py-2 font-semibold text-white transition hover:bg-neutral-500/50"
      >
        <span aria-hidden>ⓘ</span>
        More Info
      </Link>
    </div>
  );
}
