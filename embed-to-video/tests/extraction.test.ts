import { describe, expect, it } from "vitest";

import { extractFromHtml, parseDuration } from "@/lib/extraction/html";
import { extractFromJavaScript } from "@/lib/extraction/javascript";
import { isCandidateMediaUrl, isNoiseUrl } from "@/lib/extraction/filters";
import { normalizeSource, normalizeSources } from "@/lib/resolver/normalizer";

const BASE = "https://embed.example.com/embed/123";

describe("extractFromHtml", () => {
  it("finds a <video src>", () => {
    const html = `<video src="https://cdn.example.com/a.mp4" poster="/p.jpg"></video>`;
    const result = extractFromHtml(html);
    expect(result.sources[0].url).toBe("https://cdn.example.com/a.mp4");
    expect(result.thumbnail).toBe("/p.jpg");
  });

  it("finds <source> children with quality annotations", () => {
    const html = `
      <video>
        <source src="https://cdn.example.com/1080.mp4" type="video/mp4" size="1080" />
        <source src="https://cdn.example.com/720.mp4" type="video/mp4" label="720p" />
      </video>`;
    const sources = extractFromHtml(html).sources;
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ type: "mp4", height: 1080 });
    expect(sources[1]).toMatchObject({ quality: "720p" });
  });

  it("reads Open Graph video metadata", () => {
    const html = `
      <meta property="og:video:secure_url" content="https://cdn.example.com/og.m3u8">
      <meta property="og:video:type" content="application/x-mpegURL">
      <meta property="og:video:width" content="1920">
      <meta property="og:video:height" content="1080">
      <meta property="og:title" content="An Example Film">
      <meta property="og:image" content="https://cdn.example.com/poster.jpg">`;
    const result = extractFromHtml(html);
    expect(result.sources[0]).toMatchObject({ type: "hls", width: 1920, height: 1080 });
    expect(result.title).toBe("An Example Film");
    expect(result.thumbnail).toBe("https://cdn.example.com/poster.jpg");
  });

  it("reads schema.org VideoObject metadata", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: "Documented Video",
      contentUrl: "https://cdn.example.com/ld.mp4",
      thumbnailUrl: "https://cdn.example.com/ld.jpg",
      duration: "PT1H2M3S",
    })}</script>`;
    const result = extractFromHtml(html);
    expect(result.sources[0].url).toBe("https://cdn.example.com/ld.mp4");
    expect(result.title).toBe("Documented Video");
    expect(result.duration).toBe(3723);
  });

  it("survives malformed JSON-LD", () => {
    const html = `<script type="application/ld+json">{ not json </script><video src="/a.mp4"></video>`;
    expect(extractFromHtml(html).sources[0].url).toBe("/a.mp4");
  });

  it("returns nothing for a page with no video", () => {
    expect(extractFromHtml("<html><body><p>hello</p></body></html>").sources).toEqual([]);
  });
});

describe("parseDuration", () => {
  it("parses ISO-8601 and plain seconds", () => {
    expect(parseDuration("PT1M30S")).toBe(90);
    expect(parseDuration("PT2H")).toBe(7200);
    expect(parseDuration("620")).toBe(620);
    expect(parseDuration(undefined)).toBeUndefined();
    expect(parseDuration("nonsense")).toBeUndefined();
  });
});

describe("extractFromJavaScript", () => {
  it("finds an absolute m3u8", () => {
    const urls = extractFromJavaScript(`var s = "https://cdn.example.com/master.m3u8";`);
    expect(urls.some((s) => s.url === "https://cdn.example.com/master.m3u8")).toBe(true);
  });

  it("finds a JSON-escaped URL", () => {
    const urls = extractFromJavaScript(`{"file":"https:\\/\\/cdn.example.com\\/e.m3u8"}`);
    expect(urls.some((s) => s.url === "https://cdn.example.com/e.m3u8")).toBe(true);
  });

  it("finds a unicode-escaped URL", () => {
    const urls = extractFromJavaScript(`x = "https:\\u002F\\u002Fcdn.example.com\\u002Fu.mp4"`);
    expect(urls.some((s) => s.url === "https://cdn.example.com/u.mp4")).toBe(true);
  });

  it("finds an HTML-entity-encoded URL", () => {
    const urls = extractFromJavaScript(`src=https://cdn.example.com/a.mp4&amp;token=1`);
    expect(urls.some((s) => s.url.startsWith("https://cdn.example.com/a.mp4"))).toBe(true);
  });

  it("finds protocol-relative and root-relative URLs", () => {
    const urls = extractFromJavaScript(`a="//cdn.example.com/p.mp4"; b="/media/local.m3u8";`);
    const found = urls.map((s) => s.url);
    expect(found).toContain("//cdn.example.com/p.mp4");
    expect(found).toContain("/media/local.m3u8");
  });

  it("keeps quality labels from a player config", () => {
    const config = `sources: [
      {file: "https://cdn.example.com/1080.mp4", label: "1080p", height: 1080, bitrate: 4500000},
      {file: "https://cdn.example.com/480.mp4", label: "480p", height: 480}
    ]`;
    const urls = extractFromJavaScript(config);
    const hd = urls.find((s) => s.url.includes("1080") && s.quality);
    expect(hd).toMatchObject({ quality: "1080p", height: 1080, bitrate: 4500000 });
  });

  it("does not turn a path from an absolute URL into a relative candidate", () => {
    const urls = extractFromJavaScript(`"https://other-cdn.example.net/deep/path/v.m3u8"`);
    expect(urls.map((s) => s.url)).not.toContain("/deep/path/v.m3u8");
  });

  it("finds all four supported formats", () => {
    const urls = extractFromJavaScript(`
      "https://c.example.com/a.m3u8" "https://c.example.com/b.mp4"
      "https://c.example.com/c.webm" "https://c.example.com/d.mpd"`);
    const found = urls.map((s) => s.url);
    expect(found).toEqual(
      expect.arrayContaining([
        "https://c.example.com/a.m3u8",
        "https://c.example.com/b.mp4",
        "https://c.example.com/c.webm",
        "https://c.example.com/d.mpd",
      ]),
    );
  });

  it("returns nothing for text with no media", () => {
    expect(extractFromJavaScript(`var a = "https://example.com/page.html";`)).toEqual([]);
  });
});

describe("normalizeSource", () => {
  it("infers type and mime for each format", () => {
    expect(normalizeSource({ url: "https://c.example.com/a.m3u8" }, BASE)).toMatchObject({
      type: "hls",
      mimeType: "application/vnd.apple.mpegurl",
    });
    expect(normalizeSource({ url: "https://c.example.com/a.mp4" }, BASE)).toMatchObject({
      type: "mp4",
      mimeType: "video/mp4",
    });
    expect(normalizeSource({ url: "https://c.example.com/a.webm" }, BASE)).toMatchObject({
      type: "webm",
      mimeType: "video/webm",
    });
    expect(normalizeSource({ url: "https://c.example.com/a.mpd" }, BASE)).toMatchObject({
      type: "dash",
      mimeType: "application/dash+xml",
      isMaster: true,
    });
  });

  it("resolves relative and protocol-relative URLs", () => {
    expect(normalizeSource({ url: "/media/a.mp4" }, BASE)?.url).toBe(
      "https://embed.example.com/media/a.mp4",
    );
    expect(normalizeSource({ url: "//cdn.example.com/a.mp4" }, BASE)?.url).toBe(
      "https://cdn.example.com/a.mp4",
    );
    expect(normalizeSource({ url: "../up/a.mp4" }, "https://e.example.com/a/b/c")?.url).toBe(
      "https://e.example.com/a/up/a.mp4",
    );
  });

  it("undoes escaping", () => {
    expect(normalizeSource({ url: "https:\\/\\/c.example.com\\/a.mp4" }, BASE)?.url).toBe(
      "https://c.example.com/a.mp4",
    );
    expect(normalizeSource({ url: "https://c.example.com/a.mp4?a=1&amp;b=2" }, BASE)?.url).toBe(
      "https://c.example.com/a.mp4?a=1&b=2",
    );
  });

  it("keeps a signed query string intact", () => {
    const url = "https://c.example.com/master.m3u8?token=abc123&expires=999";
    expect(normalizeSource({ url }, BASE)).toMatchObject({ url, type: "hls" });
  });

  it("derives a quality label from height and back", () => {
    expect(
      normalizeSource({ url: "https://c.example.com/a.mp4", height: 1080 }, BASE),
    ).toMatchObject({ quality: "1080p", height: 1080 });
    expect(
      normalizeSource({ url: "https://c.example.com/a.mp4", quality: "720p" }, BASE),
    ).toMatchObject({ height: 720 });
  });

  it("rejects unusable candidates", () => {
    expect(normalizeSource({ url: "javascript:alert(1)" }, BASE)).toBeNull();
    expect(normalizeSource({ url: "data:video/mp4;base64,AAAA" }, BASE)).toBeNull();
    expect(normalizeSource({ url: "https://c.example.com/page.html" }, BASE)).toBeNull();
    expect(normalizeSource({ url: "" }, BASE)).toBeNull();
  });
});

describe("normalizeSources", () => {
  it("removes duplicates and keeps the richer entry", () => {
    const result = normalizeSources(
      [
        { url: "https://c.example.com/a.mp4" },
        { url: "https://c.example.com/a.mp4", height: 1080, bitrate: 4_000_000 },
        { url: "https://c.example.com/a.mp4?" },
      ],
      BASE,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ height: 1080, quality: "1080p" });
  });

  it("orders adaptive manifests first, then by height", () => {
    const result = normalizeSources(
      [
        { url: "https://c.example.com/480.mp4", height: 480 },
        { url: "https://c.example.com/1080.mp4", height: 1080 },
        { url: "https://c.example.com/master.m3u8", isMaster: true },
        { url: "https://c.example.com/720.mp4", height: 720 },
      ],
      BASE,
    );
    expect(result.map((s) => s.quality)).toEqual(["Auto", "1080p", "720p", "480p"]);
  });
});

describe("noise filters", () => {
  it("rejects ad, analytics and asset URLs", () => {
    expect(isNoiseUrl(new URL("https://doubleclick.net/a.mp4"))).toBe(true);
    expect(isNoiseUrl(new URL("https://cdn.example.com/ads/preroll.mp4"))).toBe(true);
    expect(isNoiseUrl(new URL("https://cdn.example.com/style.css"))).toBe(true);
    expect(isNoiseUrl(new URL("https://cdn.example.com/poster.jpg"))).toBe(true);
  });

  it("accepts a real media URL", () => {
    expect(isCandidateMediaUrl(new URL("https://cdn.example.com/video/master.m3u8"))).toBe(true);
    expect(isCandidateMediaUrl(new URL("https://cdn.example.com/page.html"))).toBe(false);
  });
});
