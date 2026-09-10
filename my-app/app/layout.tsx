import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdBlockGate from "@/components/AdBlockGate";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  SOCIAL_LINKS,
  absoluteUrl,
  jsonLd,
} from "@/lib/site";
import "./globals.css";

const inter = Inter({
  variable: "--font-hatti",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Lets every page below declare canonicals and OG images as plain paths.
  metadataBase: new URL(SITE_URL),
  title: {
    // Pages set a bare title ("Movies"); the suffix is appended once, here.
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Hatti TV",
    "watch movies online",
    "free movies",
    "TV shows",
    "anime",
    "Hindi movies",
    "Bollywood",
    "live sports streaming",
    "trailers",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: "/",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [{ url: "/logo.png", width: 1254, height: 1254, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ["/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Let Google show full text snippets, large thumbnails and full video.
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  verification: {
    google: "zrhm4CPwXJjnukQQLvi21JJg_s_cIwd-aK6j_NM7wos",
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
    shortcut: "/logo.png",
  },
  other: {
    monetag: ["0f3b78e13540632d83b2a4d4a78384a1"],
  },
};

/**
 * Site-wide structured data: who publishes the site, and the fact that it has
 * its own search. Google uses the latter to offer a search box straight in the
 * result listing.
 */
const siteLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": absoluteUrl("/#organization"),
      name: SITE_NAME,
      url: SITE_URL,
      logo: absoluteUrl("/logo.png"),
      sameAs: SOCIAL_LINKS.map((social) => social.href),
    },
    {
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: "en-US",
      publisher: { "@id": absoluteUrl("/#organization") },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: absoluteUrl("/search?q={search_term_string}"),
        },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-brand-black font-sans">
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(siteLd)} />

        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />

        <Script
          id="quge5-tag"
          src="https://quge5.com/88/tag.min.js"
          data-zone="278532"
          data-cfasync="false"
          strategy="beforeInteractive"
        />

        <AdBlockGate />
      </body>
    </html>
  );
}
