import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdBlockGate from "@/components/AdBlockGate";
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
    monetag: [
      "0f3b78e13540632d83b2a4d4a78384a1",
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-brand-black font-sans">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />

        <AdBlockGate />
      </body>
    </html>
  );
}
