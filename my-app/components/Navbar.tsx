"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import SearchBox from "@/components/SearchBox";
import { SITE_NAME } from "@/lib/site";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/tv-shows", label: "TV Shows" },
  { href: "/movies", label: "Movies" },
  { href: "/anime", label: "Anime" },
  { href: "/sports", label: "Sports" },
  { href: "/hindi-movies", label: "Hindi" },
];

/** "/" only matches itself; every other tab also owns its sub-routes. */
function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Netflix fades in a solid bar once you leave the top of the page.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Tapping a link navigates without unmounting the bar, so the panel has to
  // be closed by hand once the route settles. Adjusting during render rather
  // than in an effect avoids a frame with the menu still open, and matches
  // how SearchBox resyncs itself.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMenuOpen(false);
  }

  // Escape is the expected way out of an open menu, and it keeps the panel
  // reachable for anyone driving the page from the keyboard.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  // An open panel needs a solid backdrop even at the very top of the page,
  // otherwise the links sit on top of the hero artwork.
  const solid = scrolled || menuOpen;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        solid ? "bg-brand-black shadow-lg" : "bg-gradient-to-b from-black/80 to-transparent"
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:gap-4 md:px-12">
        <div className="flex items-center gap-2 md:gap-6">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="-ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-neutral-200 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              className="h-6 w-6"
            >
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M3 6h18M3 12h18M3 18h18" />
              )}
            </svg>
          </button>

          <Link
            href="/"
            aria-label={`${SITE_NAME} home`}
            className="flex shrink-0 items-center"
          >
            <img
              src="/logo.png"
              alt={SITE_NAME}
              width={1254}
              height={1254}
              className="h-9 w-auto sm:h-11"
            />
          </Link>

          <nav
            aria-label="Primary"
            className="hidden gap-4 text-sm text-neutral-300 md:flex"
          >
            {LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`transition hover:text-white ${
                    active ? "font-semibold text-white" : ""
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <Suspense fallback={<div className="h-8 w-40" />}>
          <SearchBox />
        </Suspense>
      </div>

      {menuOpen ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-white/10 bg-brand-black md:hidden"
        >
          <ul className="flex flex-col py-2">
            {LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    // Full-width, 44px-tall rows: a comfortable tap target.
                    className={`block border-l-2 px-4 py-3 text-base transition ${
                      active
                        ? "border-brand bg-white/5 font-semibold text-white"
                        : "border-transparent text-neutral-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
