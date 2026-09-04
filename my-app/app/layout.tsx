import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import Navbar from "@/components/Navbar";
import "./globals.css";

const inter = Inter({
  variable: "--font-filmhouse",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Filmhouse TV — Movies & TV Shows",
  description:
    "Browse movies, TV shows, anime and Hindi cinema, with trailers, powered by the TMDB API.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
    shortcut: "/logo.png",
  },
  other: {
    monetag: "b3161416359da337fc7de5be85a55cb1",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-brand-black font-sans">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="mt-16 px-4 py-10 text-center text-xs text-neutral-500 md:px-12">
          <p className="mb-2 tracking-[0.3em] text-brand/80">
            MOVIES &amp; TV SHOWS
          </p>
          <p>
            This product uses the TMDB API but is not endorsed or certified by
            TMDB. Built as a learning project.
          </p>
        </footer>
      </body>
    </html>
  );
}
