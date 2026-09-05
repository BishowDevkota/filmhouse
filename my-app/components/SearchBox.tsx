"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

// The hero gets a wider, taller field; the navbar keeps the compact one.
const VARIANTS = {
  navbar: {
    form: "gap-2 rounded border border-white/30 bg-black/60 px-3 py-1.5 focus-within:border-white/80",
    icon: "text-sm text-neutral-400",
    input: "w-28 text-sm sm:w-48",
  },
  hero: {
    // mr-14 keeps the pill clear of HeroPlayer's mute button, which is
    // pinned bottom-right until the sm breakpoint widens the viewport.
    form: "mr-14 max-w-md gap-3 rounded-full border border-white/25 bg-black/60 px-5 py-3 shadow-lg backdrop-blur-sm focus-within:border-brand sm:mr-0",
    icon: "text-base text-neutral-300",
    input: "w-full text-sm sm:text-base",
  },
} as const;

export default function SearchBox({
  variant = "navbar",
  placeholder = "Titles, genres…",
}: {
  variant?: keyof typeof VARIANTS;
  placeholder?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const styles = VARIANTS[variant];

  const [query, setQuery] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);

  // Resync the field when the URL changes (back button, a link, a new search).
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = query.trim();
        router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/");
      }}
      className={`flex items-center transition-colors ${styles.form}`}
    >
      <span aria-hidden className={styles.icon}>
        🔍
      </span>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label="Search titles"
        className={`bg-transparent text-white placeholder:text-neutral-500 focus:outline-none ${styles.input}`}
      />
    </form>
  );
}
