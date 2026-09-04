"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MediaCard from "@/components/MediaCard";
import type { CardItem } from "@/lib/tmdb";

export default function RowCarousel({
  title,
  items,
}: {
  title: string;
  items: CardItem[];
}) {
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
  }, [syncArrows, items.length]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  };

  if (items.length === 0) return null;

  return (
    <section className="group/row relative">
      <h2 className="mb-2 px-4 text-lg font-semibold text-neutral-200 md:px-12 md:text-xl">
        {title}
      </h2>

      <div className="relative">
        {canScrollLeft ? (
          <button
            type="button"
            aria-label={`Scroll ${title} left`}
            onClick={() => scrollByPage(-1)}
            className="absolute top-0 bottom-0 left-0 z-20 hidden w-12 items-center justify-center bg-black/60 text-3xl text-white opacity-0 transition hover:bg-black/80 group-hover/row:opacity-100 focus-visible:opacity-100 md:flex"
          >
            ‹
          </button>
        ) : null}

        <div
          ref={scrollerRef}
          onScroll={syncArrows}
          className="no-scrollbar flex gap-2 overflow-x-auto scroll-smooth px-4 py-8 md:px-12"
        >
          {items.map((item) => (
            <MediaCard key={`${item.mediaType}-${item.id}`} item={item} />
          ))}
        </div>

        {canScrollRight ? (
          <button
            type="button"
            aria-label={`Scroll ${title} right`}
            onClick={() => scrollByPage(1)}
            className="absolute top-0 right-0 bottom-0 z-20 hidden w-12 items-center justify-center bg-black/60 text-3xl text-white opacity-0 transition hover:bg-black/80 group-hover/row:opacity-100 focus-visible:opacity-100 md:flex"
          >
            ›
          </button>
        ) : null}
      </div>
    </section>
  );
}
