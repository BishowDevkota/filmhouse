"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

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
      className="flex items-center gap-2 rounded border border-white/30 bg-black/60 px-3 py-1.5 focus-within:border-white/80"
    >
      <span aria-hidden className="text-sm text-neutral-400">
        🔍
      </span>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Titles, genres…"
        aria-label="Search titles"
        className="w-28 bg-transparent text-sm text-white placeholder:text-neutral-500 focus:outline-none sm:w-48"
      />
    </form>
  );
}
