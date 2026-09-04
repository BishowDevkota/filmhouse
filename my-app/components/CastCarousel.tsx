"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WatchCastMember } from "@/lib/watch";

/** Initials plaque used when a cast member has no profile photo on TMDB. */
function Initials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-black text-3xl font-black text-neutral-600">
      {initials || "?"}
    </div>
  );
}

function CastCard({ member }: { member: WatchCastMember }) {
  return (
    <figure className="group/cast w-32 flex-none sm:w-36 md:w-40">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/10 transition duration-300 group-hover/cast:-translate-y-1 group-hover/cast:shadow-[0_18px_40px_-18px_rgba(235,18,24,0.55)] group-hover/cast:ring-brand/60">
        {member.image ? (
          <img
            src={member.image}
            alt={member.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
        ) : (
          <Initials name={member.name} />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition duration-300 group-hover/cast:opacity-100" />
      </div>

      <figcaption className="mt-2.5 px-0.5">
        <p className="truncate text-sm font-semibold text-white">
          {member.name}
        </p>
        {member.character ? (
          <p className="truncate text-xs text-neutral-400">
            {member.character}
          </p>
        ) : null}
      </figcaption>
    </figure>
  );
}

/**
 * Top-billed cast as a horizontal scroller. Arrows appear on hover for pointer
 * users; touch users just swipe.
 */
export default function CastCarousel({ cast }: { cast: WatchCastMember[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const syncArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    syncArrows();
    window.addEventListener("resize", syncArrows);
    return () => window.removeEventListener("resize", syncArrows);
  }, [syncArrows, cast.length]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  if (!cast.length) return null;

  return (
    <div className="group/cast-row relative">
      {canScrollLeft ? (
        <button
          type="button"
          aria-label="Scroll cast left"
          onClick={() => scrollByPage(-1)}
          className="absolute top-1/2 -left-3 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/80 text-2xl text-white opacity-0 backdrop-blur transition hover:border-brand/60 hover:text-brand focus-visible:opacity-100 group-hover/cast-row:opacity-100 md:flex"
        >
          ‹
        </button>
      ) : null}

      <div
        ref={scrollerRef}
        onScroll={syncArrows}
        className="no-scrollbar flex gap-4 overflow-x-auto scroll-smooth pb-2"
      >
        {cast.map((member) => (
          <CastCard key={member.id} member={member} />
        ))}
      </div>

      {canScrollRight ? (
        <button
          type="button"
          aria-label="Scroll cast right"
          onClick={() => scrollByPage(1)}
          className="absolute top-1/2 -right-3 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/80 text-2xl text-white opacity-0 backdrop-blur transition hover:border-brand/60 hover:text-brand focus-visible:opacity-100 group-hover/cast-row:opacity-100 md:flex"
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
