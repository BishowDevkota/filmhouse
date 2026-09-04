"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import SearchBox from "@/components/SearchBox";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/tv-shows", label: "TV Shows" },
  { href: "/movies", label: "Movies" },
  { href: "/anime", label: "Anime" },
  { href: "/hindi-movies", label: "Hindi" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  // Netflix fades in a solid bar once you leave the top of the page.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-300 md:px-12 ${
        scrolled
          ? "bg-brand-black shadow-lg"
          : "bg-gradient-to-b from-black/80 to-transparent"
      }`}
    >
      <div className="flex items-center gap-6">
        <Link
          href="/"
          aria-label="Clips Hub home"
          className="flex items-baseline gap-1.5 text-xl font-extrabold tracking-tight sm:text-2xl"
        >
          <span className="text-white">CLIPS</span>
          <span className="text-gradient-gold">HUB</span>
        </Link>
        <nav className="hidden gap-4 text-sm text-neutral-300 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <Suspense fallback={<div className="h-8 w-40" />}>
        <SearchBox />
      </Suspense>
    </header>
  );
}
