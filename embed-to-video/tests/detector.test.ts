import { describe, expect, it } from "vitest";

import { detectProvider } from "@/lib/resolver/detector";
import { listProviderInfo, providers } from "@/lib/resolver/registry";
import type { VideoProvider } from "@/lib/resolver/types";

const detect = (href: string) => detectProvider(new URL(href)).name;

describe("detectProvider", () => {
  it("matches a supported provider by domain", () => {
    expect(detect("https://archive.org/embed/night_of_the_living_dead")).toBe("InternetArchive");
    expect(detect("https://archive.org/details/some_item")).toBe("InternetArchive");
  });

  it("matches on a subdomain of a supported provider", () => {
    expect(detect("https://web.archive.org/embed/some_item")).toBe("InternetArchive");
    expect(detect("https://www.youtube.com/embed/abc")).toBe("Restricted");
    expect(detect("https://player.vimeo.com/video/123")).toBe("Restricted");
  });

  it("does not match a lookalike domain", () => {
    // `notarchive.org` must not be treated as a subdomain of `archive.org`.
    expect(detect("https://notarchive.org/embed/x")).toBe("Generic");
    expect(detect("https://archive.org.evil.example/embed/x")).toBe("Generic");
  });

  it("falls back to Generic when the path is wrong for the provider", () => {
    expect(detect("https://archive.org/about")).toBe("Generic");
    expect(detect("https://archive.org/")).toBe("Generic");
  });

  it("matches PeerTube by URL shape on any instance", () => {
    expect(detect("https://tube.example.org/videos/embed/1a2b3c4d-5e6f")).toBe("PeerTube");
    expect(detect("https://tube.example.org/videos/watch/1a2b3c4d-5e6f")).toBe("PeerTube");
    expect(detect("https://tube.example.org/w/aBcDeFgHiJkL")).toBe("PeerTube");
    expect(detect("https://tube.example.org/some/other/path")).toBe("Generic");
  });

  it("routes a direct media URL to DirectMedia", () => {
    expect(detect("https://cdn.example.com/master.m3u8")).toBe("DirectMedia");
    expect(detect("https://cdn.example.com/video.mp4?token=1")).toBe("DirectMedia");
    expect(detect("https://cdn.example.com/manifest.mpd")).toBe("DirectMedia");
  });

  it("refuses restricted platforms before any other adapter can claim them", () => {
    // Restricted is registered first on purpose: a direct-looking media URL on a
    // restricted host must still be refused.
    expect(detect("https://ytimg.com/whatever.mp4")).toBe("Restricted");
    expect(detect("https://youtu.be/abc123")).toBe("Restricted");
    expect(detect("https://www.netflix.com/watch/123")).toBe("Restricted");
  });

  it("falls back to Generic for an unknown provider", () => {
    expect(detect("https://unknown-host.example/embed/1")).toBe("Generic");
  });

  it("skips a provider whose canHandle throws", () => {
    const broken: VideoProvider = {
      name: "Broken",
      info: {
        name: "Broken",
        domains: [],
        formats: [],
        requiresBrowser: false,
        description: "throws",
      },
      canHandle() {
        throw new Error("boom");
      },
      async resolve() {
        throw new Error("boom");
      },
    };

    expect(detectProvider(new URL("https://example.com/x"), [broken]).name).toBe("Generic");
  });
});

describe("registry", () => {
  it("keeps Generic last so it cannot shadow a specific adapter", () => {
    expect(providers.at(-1)?.name).toBe("Generic");
  });

  it("keeps Restricted first so refusals win", () => {
    expect(providers[0]?.name).toBe("Restricted");
  });

  it("exposes documentation for every provider", () => {
    const info = listProviderInfo();
    expect(info).toHaveLength(providers.length);
    for (const entry of info) {
      expect(entry.name).toBeTruthy();
      expect(entry.description.length).toBeGreaterThan(20);
    }
  });
});
