import Link from "next/link";
import HeroPlayer from "@/components/HeroPlayer";

/**
 * Detail-page hero: ambient muted preview behind the title, with links to the
 * full-length player (movie or series) and to the dedicated trailer page.
 */
export default function TitleHero({
  backdrop,
  title,
  trailerKey,
  watchHref,
  trailerHref,
  watchLabel,
  children,
}: {
  backdrop: string | null;
  title: string;
  trailerKey: string | null;
  watchHref: string;
  trailerHref?: string;
  watchLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative h-[56vw] max-h-[80vh] min-h-[380px] w-full overflow-hidden">
      <HeroPlayer
        backdrop={backdrop}
        title={title}
        trailerKey={trailerKey}
        startDelayMs={700}
        muteClassName="right-4 bottom-6 md:right-12"
      />

      <div className="relative z-10 flex h-full max-w-3xl flex-col justify-end gap-4 px-4 pb-10 md:px-12 md:pb-16">
        {children}

        <div className="flex flex-wrap gap-3">
          <Link
            href={watchHref}
            className="flex items-center gap-2 rounded bg-brand px-7 py-2.5 font-semibold text-black transition hover:bg-brand-bright"
          >
            <span aria-hidden>▶</span>
            {watchLabel}
          </Link>

          {trailerHref ? (
            <Link
              href={trailerHref}
              className="flex items-center gap-2 rounded bg-neutral-500/70 px-7 py-2.5 font-semibold text-white transition hover:bg-neutral-500/50"
            >
              <span aria-hidden>▶</span>
              Watch Trailer
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
