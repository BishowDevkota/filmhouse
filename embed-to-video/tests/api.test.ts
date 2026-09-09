import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NextRequest } from "next/server";
import type { ResolveResult } from "@/types/video";

/**
 * DNS is mocked so the SSRF checks run for real without touching the network.
 * Only `internal.example.com` resolves into private space.
 */
vi.mock("node:dns/promises", () => ({
  default: {
    lookup: async (hostname: string) => {
      if (hostname === "internal.example.com") return [{ address: "10.0.0.5", family: 4 }];
      if (hostname === "nxdomain.example.com") throw new Error("ENOTFOUND");
      return [{ address: "93.184.216.34", family: 4 }];
    },
  },
}));

type RouteHandler = (url: URL) => Response | Promise<Response>;

let routes = new Map<string, RouteHandler>();
let fetchCalls: string[] = [];

/** Register a response for one `origin + pathname`. */
function route(href: string, handler: RouteHandler | string, contentType = "text/html") {
  const url = new URL(href);
  routes.set(
    url.origin + url.pathname,
    typeof handler === "string"
      ? () => new Response(handler, { status: 200, headers: { "content-type": contentType } })
      : handler,
  );
}

beforeEach(async () => {
  routes = new Map();
  fetchCalls = [];

  vi.stubGlobal("fetch", async (input: URL | string) => {
    const url = new URL(String(input));
    fetchCalls.push(url.toString());
    const handler = routes.get(url.origin + url.pathname);
    if (!handler) return new Response("missing", { status: 404 });
    return handler(url);
  });

  // The resolver caches successes in module memory; clear between tests.
  const { clearResolveCache } = await import("@/lib/resolver");
  clearResolveCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

let clientCounter = 0;

/** POST to the route handler as a fresh client, to avoid the shared limiter. */
async function post(
  body: unknown,
  clientIp?: string,
): Promise<{ status: number; body: ResolveResult }> {
  const { POST } = await import("@/app/api/resolve/route");
  clientCounter += 1;

  const request = new Request("http://localhost:3000/api/resolve", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": clientIp ?? `203.0.113.${clientCounter % 250}`,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;

  const response = await POST(request);
  return { status: response.status, body: (await response.json()) as ResolveResult };
}

const PAGE_WITH_MP4 = `
  <html><head><title>Example Film</title>
    <meta property="og:image" content="https://cdn.example.com/poster.jpg">
  </head><body>
    <video poster="https://cdn.example.com/poster.jpg">
      <source src="https://cdn.example.com/1080.mp4" type="video/mp4" size="1080">
      <source src="https://cdn.example.com/480.mp4" type="video/mp4" size="480">
    </video>
  </body></html>`;

describe("POST /api/resolve — success", () => {
  it("resolves an embed page into normalized sources", async () => {
    route("https://embed.example.com/embed/1", PAGE_WITH_MP4);

    const { status, body } = await post({ url: "https://embed.example.com/embed/1" });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.provider).toBe("Generic");
    expect(body.originalUrl).toBe("https://embed.example.com/embed/1");
    expect(body.title).toBe("Example Film");
    expect(body.sources).toHaveLength(2);
    expect(body.sources[0]).toMatchObject({
      url: "https://cdn.example.com/1080.mp4",
      type: "mp4",
      mimeType: "video/mp4",
      quality: "1080p",
    });
  });

  it("accepts a pasted iframe tag", async () => {
    route("https://embed.example.com/embed/2", PAGE_WITH_MP4);

    const { status, body } = await post({
      url: `<iframe src="https://embed.example.com/embed/2" width="640"></iframe>`,
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.originalUrl).toBe("https://embed.example.com/embed/2");
  });

  it("detects an HLS master playlist and labels it Auto", async () => {
    route(
      "https://embed.example.com/embed/3",
      `<script>var config = {"file":"https:\\/\\/cdn.example.com\\/master.m3u8"};</script>`,
    );
    route(
      "https://cdn.example.com/master.m3u8",
      `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=4500000,RESOLUTION=1920x1080
1080/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=1280x720
720/index.m3u8`,
      "application/vnd.apple.mpegurl",
    );

    const { body } = await post({ url: "https://embed.example.com/embed/3" });

    expect(body.success).toBe(true);
    expect(body.sources[0]).toMatchObject({
      url: "https://cdn.example.com/master.m3u8",
      type: "hls",
      mimeType: "application/vnd.apple.mpegurl",
      isMaster: true,
      height: 1080,
      quality: "Auto",
    });
  });

  it("passes a direct media URL straight through", async () => {
    route("https://cdn.example.com/direct.mp4", "binary");

    const { body } = await post({ url: "https://cdn.example.com/direct.mp4" });

    expect(body.success).toBe(true);
    expect(body.provider).toBe("DirectMedia");
    expect(body.sources[0].url).toBe("https://cdn.example.com/direct.mp4");
  });

  it("follows a safe redirect and resolves relative URLs against the final URL", async () => {
    route(
      "https://embed.example.com/old",
      () =>
        new Response(null, { status: 302, headers: { location: "https://embed.example.com/new" } }),
    );
    route("https://embed.example.com/new", `<video src="/media/clip.mp4"></video>`);

    const { body } = await post({ url: "https://embed.example.com/old" });

    expect(body.success).toBe(true);
    expect(body.sources[0].url).toBe("https://embed.example.com/media/clip.mp4");
  });
});

describe("POST /api/resolve — caching", () => {
  it("serves a repeated request from cache without refetching", async () => {
    route("https://embed.example.com/cached", PAGE_WITH_MP4);

    const first = await post({ url: "https://embed.example.com/cached" });
    const callsAfterFirst = fetchCalls.length;
    const second = await post({ url: "https://embed.example.com/cached" });

    expect(first.body.success).toBe(true);
    expect(second.body).toEqual(first.body);
    expect(fetchCalls.length).toBe(callsAfterFirst);
  });

  it("refetches when refresh is set", async () => {
    route("https://embed.example.com/refresh", PAGE_WITH_MP4);

    await post({ url: "https://embed.example.com/refresh" });
    const callsAfterFirst = fetchCalls.length;
    await post({ url: "https://embed.example.com/refresh", refresh: true });

    expect(fetchCalls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe("POST /api/resolve — failures", () => {
  it("returns no_source for a page with no video", async () => {
    route("https://embed.example.com/empty", "<html><body><p>nothing here</p></body></html>");

    const { status, body } = await post({ url: "https://embed.example.com/empty" });

    expect(status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe("no_source");
    expect(body.sources).toEqual([]);
    expect(body.error).toMatch(/no authorized playable source/i);
  });

  it("explains that a page behind a challenge is not bypassed", async () => {
    route(
      "https://embed.example.com/walled",
      `<html><body><div class="cf-turnstile" data-sitekey="abc"></div></body></html>`,
    );

    const { body } = await post({ url: "https://embed.example.com/walled" });

    expect(body.errorCode).toBe("no_source");
    expect(body.error).toMatch(/does not bypass access controls/i);
  });

  it("refuses a restricted platform without fetching it", async () => {
    const { status, body } = await post({ url: "https://www.youtube.com/embed/abc123" });

    expect(status).toBe(422);
    expect(body.errorCode).toBe("unsupported_provider");
    expect(body.error).toMatch(/terms of service/i);
    expect(fetchCalls).toHaveLength(0);
  });

  it("reports a provider that is unreachable", async () => {
    route("https://embed.example.com/down", () => {
      throw new TypeError("fetch failed");
    });

    const { status, body } = await post({ url: "https://embed.example.com/down" });

    expect(status).toBe(502);
    expect(body.errorCode).toBe("network_error");
  });

  it("reports a timeout", async () => {
    route("https://embed.example.com/slow", () => {
      const error = new Error("The operation timed out.");
      error.name = "TimeoutError";
      throw error;
    });

    const { status, body } = await post({ url: "https://embed.example.com/slow" });

    expect(status).toBe(504);
    expect(body.errorCode).toBe("timeout");
  });

  it("never leaks internal detail in the response", async () => {
    route("https://embed.example.com/boom", () => {
      throw new Error("connect ECONNREFUSED 10.1.2.3:8080 at internalHandler (/srv/app.js:42)");
    });

    const { body } = await post({ url: "https://embed.example.com/boom" });

    expect(body.error).not.toMatch(/ECONNREFUSED|10\.1\.2\.3|srv\/app\.js/);
  });
});

describe("POST /api/resolve — SSRF protection", () => {
  const blocked = [
    "http://localhost:3000/embed",
    "http://127.0.0.1/embed",
    "http://0.0.0.0/embed",
    "http://[::1]/embed",
    "http://10.0.0.1/embed",
    "http://192.168.1.1/embed",
    "http://172.16.0.1/embed",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://db.internal/embed",
    "http://printer.local/embed",
  ];

  it.each(blocked)("blocks %s", async (url) => {
    const { status, body } = await post({ url });

    expect(status).toBe(403);
    expect(body.errorCode).toBe("blocked_url");
    expect(fetchCalls).toHaveLength(0);
  });

  it("blocks a public hostname that resolves to a private address", async () => {
    const { status, body } = await post({ url: "https://internal.example.com/embed" });

    expect(status).toBe(403);
    expect(body.errorCode).toBe("blocked_url");
    expect(fetchCalls).toHaveLength(0);
  });

  it("blocks a redirect into private address space", async () => {
    route(
      "https://embed.example.com/redirect",
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
    );

    const { status, body } = await post({ url: "https://embed.example.com/redirect" });

    expect(status).toBe(403);
    expect(body.errorCode).toBe("blocked_url");
    // The first hop was fetched; the metadata endpoint never was.
    expect(fetchCalls).toEqual(["https://embed.example.com/redirect"]);
  });

  it("reports an unresolvable hostname as unreachable, not blocked", async () => {
    // Failing DNS means no connection is opened either way, but calling it a
    // policy block would misdescribe a typo.
    const { status, body } = await post({ url: "https://nxdomain.example.com/embed" });

    expect(status).toBe(502);
    expect(body.errorCode).toBe("network_error");
    expect(fetchCalls).toHaveLength(0);
  });

  it("blocks a URL carrying credentials", async () => {
    const { status, body } = await post({ url: "https://user:pass@embed.example.com/x" });

    expect(status).toBe(403);
    expect(body.errorCode).toBe("blocked_url");
  });

  it("stops following after too many redirects", async () => {
    route(
      "https://embed.example.com/loop",
      (url) =>
        new Response(null, {
          status: 302,
          headers: {
            location: `https://embed.example.com/loop?n=${url.searchParams.get("n") ?? 0}1`,
          },
        }),
    );

    const { body } = await post({ url: "https://embed.example.com/loop" });

    expect(body.success).toBe(false);
    expect(fetchCalls.length).toBeLessThanOrEqual(7);
  });
});

describe("POST /api/resolve — request validation", () => {
  it("rejects a body that is not JSON", async () => {
    const { status, body } = await post("not json at all");
    expect(status).toBe(400);
    expect(body.errorCode).toBe("invalid_request");
  });

  it("rejects a missing url field", async () => {
    const { status, body } = await post({});
    expect(status).toBe(400);
    expect(body.errorCode).toBe("invalid_request");
  });

  it("rejects an empty url", async () => {
    const { status, body } = await post({ url: "" });
    expect(status).toBe(400);
    expect(body.errorCode).toBe("invalid_request");
  });

  it("rejects unknown fields", async () => {
    const { status, body } = await post({ url: "https://a.example/x", surprise: true });
    expect(status).toBe(400);
    expect(body.errorCode).toBe("invalid_request");
  });

  it("rejects a non-http scheme", async () => {
    const { status, body } = await post({ url: "ftp://example.com/video.mp4" });
    expect(status).toBe(400);
    expect(body.errorCode).toBe("invalid_url");
  });

  it("rejects an unparseable URL", async () => {
    const { status, body } = await post({ url: "!!! not a url !!!" });
    expect(status).toBe(400);
    expect(body.errorCode).toBe("invalid_url");
  });

  it("rejects an over-long url field", async () => {
    const { status, body } = await post({ url: `https://a.example/${"x".repeat(9000)}` });
    expect(status).toBe(400);
    expect(body.errorCode).toBe("invalid_request");
  });
});

describe("POST /api/resolve — rate limiting", () => {
  it("returns 429 with Retry-After once the limit is exceeded", async () => {
    const { POST } = await import("@/app/api/resolve/route");
    const { config } = await import("@/lib/config");
    route("https://embed.example.com/rl", PAGE_WITH_MP4);

    const send = () =>
      POST(
        new Request("http://localhost:3000/api/resolve", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
          body: JSON.stringify({ url: "https://embed.example.com/rl" }),
        }) as unknown as NextRequest,
      );

    let limited: Response | null = null;
    for (let attempt = 0; attempt <= config.rateLimitRequests; attempt += 1) {
      const response = await send();
      if (response.status === 429) {
        limited = response;
        break;
      }
    }

    expect(limited).not.toBeNull();
    expect(limited?.headers.get("Retry-After")).toBeTruthy();
    expect(limited?.headers.get("X-RateLimit-Limit")).toBe(String(config.rateLimitRequests));
    expect(((await limited?.json()) as ResolveResult).errorCode).toBe("rate_limited");
  });
});

describe("GET /api/providers", () => {
  it("lists every registered provider", async () => {
    const { GET } = await import("@/app/api/providers/route");
    const response = await GET();
    const body = (await response.json()) as {
      providers: Array<{ name: string }>;
      browserResolverEnabled: boolean;
    };

    expect(response.status).toBe(200);
    expect(body.providers.map((provider) => provider.name)).toContain("Generic");
    expect(body.browserResolverEnabled).toBe(false);
  });
});
