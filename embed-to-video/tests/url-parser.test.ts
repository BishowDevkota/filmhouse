import { describe, expect, it } from "vitest";

import { extractIframeUrl, parseEmbedInput } from "@/lib/utils/iframe";
import {
  canonicalizeUrl,
  decodeHtmlEntities,
  sanitizeUrlForLog,
  streamTypeForUrl,
  unescapeJsString,
} from "@/lib/utils/urls";

describe("parseEmbedInput", () => {
  it("accepts a direct URL", () => {
    expect(parseEmbedInput("https://example.com/embed/123")).toEqual({
      ok: true,
      url: "https://example.com/embed/123",
      source: "url",
    });
  });

  it("extracts src from an iframe tag", () => {
    const input = `<iframe src="https://example.com/embed/123" width="640" height="360"></iframe>`;
    expect(parseEmbedInput(input)).toEqual({
      ok: true,
      url: "https://example.com/embed/123",
      source: "iframe",
    });
  });

  it("handles single quotes, bare attributes and multiline tags", () => {
    expect(extractIframeUrl(`<iframe src='https://example.com/a'></iframe>`)).toBe(
      "https://example.com/a",
    );
    expect(extractIframeUrl(`<iframe src=https://example.com/b width=640>`)).toBe(
      "https://example.com/b",
    );
    expect(
      extractIframeUrl(`<iframe\n  width="640"\n  src="https://example.com/c"\n></iframe>`),
    ).toBe("https://example.com/c");
  });

  it("handles a lazy-loading iframe that uses data-src", () => {
    expect(extractIframeUrl(`<iframe data-src="https://example.com/d"></iframe>`)).toBe(
      "https://example.com/d",
    );
  });

  it("decodes HTML entities in the src", () => {
    expect(extractIframeUrl(`<iframe src="https://example.com/e?a=1&amp;b=2"></iframe>`)).toBe(
      "https://example.com/e?a=1&b=2",
    );
  });

  it("finds an iframe embedded in surrounding prose", () => {
    const input = `Here you go:\n<iframe src="https://example.com/f"></iframe>\nEnjoy!`;
    expect(extractIframeUrl(input)).toBe("https://example.com/f");
  });

  it("upgrades a protocol-relative or bare host to https", () => {
    expect(extractIframeUrl("//example.com/g")).toBe("https://example.com/g");
    expect(extractIframeUrl("example.com/h")).toBe("https://example.com/h");
  });

  it("rejects empty input", () => {
    expect(parseEmbedInput("")).toEqual({ ok: false, reason: "empty" });
    expect(parseEmbedInput("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a malformed iframe with no src", () => {
    expect(parseEmbedInput(`<iframe width="640"></iframe>`)).toEqual({
      ok: false,
      reason: "no_src",
    });
    expect(parseEmbedInput(`<iframe src=""></iframe>`)).toEqual({ ok: false, reason: "no_src" });
  });

  it("rejects non-http schemes", () => {
    expect(parseEmbedInput("javascript:alert(1)")).toEqual({
      ok: false,
      reason: "unsupported_scheme",
    });
    expect(parseEmbedInput("data:text/html,<h1>x</h1>")).toEqual({
      ok: false,
      reason: "unsupported_scheme",
    });
    expect(parseEmbedInput(`<iframe src="javascript:alert(1)"></iframe>`)).toEqual({
      ok: false,
      reason: "unsupported_scheme",
    });
  });

  it("rejects input that is far too long", () => {
    expect(parseEmbedInput("x".repeat(200_000))).toEqual({ ok: false, reason: "too_long" });
  });

  it("rejects a URL longer than the maximum", () => {
    expect(parseEmbedInput(`https://example.com/${"a".repeat(3000)}`)).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("returns null from extractIframeUrl on failure", () => {
    expect(extractIframeUrl("")).toBeNull();
    expect(extractIframeUrl("not a url at all !!!")).toBeNull();
  });
});

describe("url helpers", () => {
  it("decodes HTML entities", () => {
    expect(decodeHtmlEntities("a&amp;b")).toBe("a&b");
    expect(decodeHtmlEntities("a&#47;b")).toBe("a/b");
    expect(decodeHtmlEntities("a&#x2F;b")).toBe("a/b");
  });

  it("undoes JavaScript string escaping", () => {
    expect(unescapeJsString("https:\\/\\/a.example\\/b")).toBe("https://a.example/b");
    expect(unescapeJsString("\\u002Fpath")).toBe("/path");
  });

  it("detects the stream type from the path, ignoring the query", () => {
    expect(streamTypeForUrl(new URL("https://a.example/x.m3u8?token=1"))).toBe("hls");
    expect(streamTypeForUrl(new URL("https://a.example/x.mp4"))).toBe("mp4");
    expect(streamTypeForUrl(new URL("https://a.example/x.webm"))).toBe("webm");
    expect(streamTypeForUrl(new URL("https://a.example/x.mpd"))).toBe("dash");
    expect(streamTypeForUrl(new URL("https://a.example/page"))).toBeNull();
  });

  it("masks credentials in logged URLs", () => {
    const logged = sanitizeUrlForLog("https://user:pass@a.example/x.m3u8?token=secret&a=1");
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("pass");
    expect(logged).toContain("token=redacted");
    expect(logged).toContain("a=1");
  });

  it("canonicalizes equivalent URLs to one cache key", () => {
    expect(canonicalizeUrl(new URL("https://Example.com:443/a?b=2&a=1#frag"))).toBe(
      canonicalizeUrl(new URL("https://example.com/a?a=1&b=2")),
    );
  });
});
