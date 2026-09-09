import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Universal Video Player",
  description:
    "Resolve an authorized embed URL into a direct stream and play it in a native HTML5 player.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="app-backdrop flex min-h-full flex-col bg-zinc-950 text-zinc-200">
        {children}
      </body>
    </html>
  );
}
