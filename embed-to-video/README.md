# Universal Video Player

Resolve an authorized embed URL into a direct video stream, and play it in our
own HTML5 player.

Paste `https://archive.org/embed/night_of_the_living_dead` — or the whole
`<iframe>` tag — and the server fetches the embed, finds the real media URL,
normalizes it, and hands back a stream the browser plays in a native
`<video>` element. **The original iframe is never rendered.**

```
Embed URL ──▶ validate ──▶ detect provider ──▶ fetch ──▶ extract
                                                            │
              <video> ◀── hls.js / native ◀── normalize ◀────┘
```

---

## Contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Development](#development)
5. [Environment variables](#environment-variables)
6. [Adding a provider](#adding-a-provider)
7. [HLS playback and CORS](#hls-playback-and-cors)
8. [Security](#security)
9. [Deployment](#deployment)

---

## What it does

Given an embed URL it will:

1. Parse the input — a bare URL, or a pasted `<iframe>` tag.
2. Validate it: scheme, length, host policy, and the full SSRF check.
3. Pick a provider adapter deterministically, from the URL alone.
4. Fetch the embed (or the provider's documented public API).
5. Find declared media: HLS `.m3u8`, MP4, WebM, DASH `.mpd`.
6. Normalize every candidate into a `StreamSource`.
7. Play it in a custom player with a quality menu, keyboard shortcuts,
   picture-in-picture and fullscreen.
8. Fail clearly and specifically when it cannot.

**What it will not do:** bypass DRM, authentication, paywalls, CAPTCHAs,
bot protection or any other access control. Platforms whose terms require their
own player are refused by name, with an explanation. See
[PROVIDERS.md](PROVIDERS.md#restricted).

### Routes

| Route | Purpose |
| --- | --- |
| `/` | The resolver UI. |
| `/player?url=…` | Shareable player page; resolves on the server during render. |
| `POST /api/resolve` | Resolve one embed URL. |
| `GET /api/providers` | Documentation for every registered adapter. |

### `POST /api/resolve`

```jsonc
// Request — `url` also accepts a full <iframe> tag.
{ "url": "https://example.com/embed/123", "refresh": false }
```

```jsonc
// 200
{
  "success": true,
  "provider": "Generic",
  "originalUrl": "https://example.com/embed/123",
  "title": "An Example Film",
  "sources": [
    {
      "url": "https://cdn.example.com/master.m3u8",
      "type": "hls",
      "mimeType": "application/vnd.apple.mpegurl",
      "quality": "Auto",
      "height": 1080,
      "isMaster": true
    }
  ]
}
```

```jsonc
// 422
{
  "success": false,
  "originalUrl": "https://example.com/embed/123",
  "sources": [],
  "error": "No authorized playable source was found.",
  "errorCode": "no_source"
}
```

Failures always carry a machine-readable `errorCode`, mapped to a status:

| Code | Status | Meaning |
| --- | --- | --- |
| `invalid_request` | 400 | Body was not the expected shape. |
| `invalid_url` | 400 | The URL could not be parsed, or is not http(s). |
| `blocked_url` | 403 | Private/internal address, or refused by host policy. |
| `unsupported_provider` | 422 | Deliberately refused. |
| `no_source` | 422 | Nothing playable was declared. |
| `rate_limited` | 429 | Over the configured limit. |
| `network_error` | 502 | The provider could not be reached. |
| `provider_failure` | 502 | The adapter failed. |
| `timeout` | 504 | Over the time budget. |

Internal detail — stack traces, which SSRF rule matched, upstream error text —
is logged on the server and never included in a response.

---

## Architecture

Extraction and playback are kept strictly apart, and provider-specific logic
never leaks into either the generic extractor or a React component.

```
src/
├── app/
│   ├── page.tsx                    Home (server) → ResolvePanel (client)
│   ├── player/page.tsx             Shareable player, resolved server-side
│   └── api/
│       ├── resolve/route.ts        POST: validate → rate limit → resolve
│       └── providers/route.ts      GET: adapter documentation
│
├── components/                     Playback UI only — no extraction logic
│   ├── VideoPlayer.tsx             Owns <video> + hls.js/dash.js lifecycle
│   ├── PlayerControls.tsx          Presentational chrome
│   ├── SourceSelector.tsx          Quality menu
│   ├── EmbedInput.tsx              URL / iframe field
│   ├── ResolvePanel.tsx            Client state machine for the home page
│   ├── LoadingState.tsx
│   ├── ErrorState.tsx
│   └── ProviderBadge.tsx
│
├── lib/
│   ├── config.ts                   Environment, read once, with defaults
│   ├── resolver/
│   │   ├── index.ts                The pipeline; never throws
│   │   ├── types.ts                VideoProvider + ResolveContext contracts
│   │   ├── registry.ts             The adapter list — the one place to edit
│   │   ├── detector.ts             URL-only, deterministic matching
│   │   ├── normalizer.ts           Raw candidates → StreamSource[]
│   │   └── errors.ts               Typed failures with safe public messages
│   │
│   ├── providers/                  One file per site
│   │   ├── restricted.ts           Deliberate refusals
│   │   ├── archive.ts              archive.org public API
│   │   ├── peertube.ts             PeerTube public API
│   │   ├── direct.ts               URL is already media
│   │   └── generic.ts              HTML + inline-config scan
│   │
│   ├── extraction/
│   │   ├── html.ts                 cheerio: <video>, Open Graph, JSON-LD
│   │   ├── javascript.ts           Media URLs in inline player config
│   │   ├── manifest.ts             HLS master detection
│   │   ├── filters.ts              Ad/analytics/asset rejection
│   │   └── browser.ts              Optional Playwright fallback
│   │
│   ├── security/
│   │   ├── ssrf.ts                 IPv4/IPv6 classification + DNS checks
│   │   ├── safe-fetch.ts           The only outbound request path
│   │   ├── url-validation.ts       Zod schema + URL gate
│   │   └── domain-policy.ts        Allowlist / denylist
│   │
│   └── utils/                      urls, iframe, headers, cache,
│                                   rate-limit, logger, format
└── types/video.ts                  StreamSource, ResolveResult — shared
```

### The pipeline

```
validate URL → check cache → detect provider → run adapter
     → normalize sources → (generic fallback) → cache → ResolveResult
```

`resolveEmbed()` never throws. Every failure returns a `ResolveResult` with
`success: false` and an error code, so one broken adapter cannot take down the
route handler.

Providers receive a `ResolveContext` rather than reaching for `fetch`
themselves. That is what makes them both SSRF-safe (every request goes through
the checked fetcher) and unit-testable (the context is injectable).

> **Note on the provider interface.** The adapter signature is
> `resolve(url, context)` and it returns a `ProviderPayload`, not a full
> `ResolveResult`. Normalization, deduplication, sorting and response shaping
> happen once in the pipeline, so every adapter gets identical treatment.

---

## Installation

Requires **Node.js 20.9+**.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

Optional — only if you want the headless-browser fallback:

```bash
npm install -D playwright
npx playwright install chromium
# then set ENABLE_BROWSER_RESOLVER=true
```

The app builds and runs fine without Playwright; the browser resolver simply
reports that it is unavailable.

---

## Development

```bash
npm run dev           # Next dev server (Turbopack)
npm run build         # Production build
npm start             # Serve the production build
npm test              # Vitest, once
npm run test:watch    # Vitest, watching
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint
npm run format        # Prettier, write
```

### Tests

123 tests across six files, no network access required — DNS and `fetch` are
mocked, so the SSRF logic is exercised for real against synthetic answers.

| File | Covers |
| --- | --- |
| `tests/url-parser.test.ts` | Direct URLs, iframe HTML, malformed input, escaping, redaction |
| `tests/detector.test.ts` | Provider matching, subdomains, lookalike domains, registry order |
| `tests/extraction.test.ts` | `.m3u8`/`.mp4`/`.webm`/`.mpd`, relative and escaped URLs, duplicates |
| `tests/security.test.ts` | Loopback, private ranges, metadata endpoints, IPv6-wrapped IPv4 |
| `tests/api.test.ts` | Success, no source, unsupported, timeout, SSRF, validation, limits |
| `tests/cache.test.ts` | TTL expiry, LRU eviction, rate-limit windows |

Vitest aliases `server-only` to a stub, since that package throws outside a
server bundle.

---

## Environment variables

Copy [`.env.example`](.env.example) to `.env.local` to change anything. Every
value has a working default — the app runs with no `.env` at all.

| Variable | Default | Purpose |
| --- | --- | --- |
| `RESOLVER_TIMEOUT_MS` | `10000` | Budget per outbound request. One resolution may use twice this in total. |
| `MAX_REDIRECTS` | `5` | Redirect hops followed; each is re-validated. |
| `MAX_HTML_BYTES` | `3000000` | Cap on buffered page bytes. |
| `CACHE_TTL_SECONDS` | `300` | Resolved-source cache lifetime. `0` disables it. |
| `CACHE_MAX_ENTRIES` | `500` | LRU bound. |
| `RATE_LIMIT_REQUESTS` | `30` | Requests per window on `/api/resolve`. |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Window length. |
| `ENABLE_BROWSER_RESOLVER` | `false` | Playwright fallback. Requires Playwright. |
| `BROWSER_TIMEOUT_MS` | `20000` | Budget for a rendered page. |
| `ALLOWED_EMBED_HOSTS` | *(empty)* | Allowlist. Empty means any public host. |
| `BLOCKED_EMBED_HOSTS` | *(empty)* | Denylist. Always wins over the allowlist. |
| `ALLOW_PRIVATE_NETWORK` | `false` | Disables SSRF address checks. Never in production. |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error`. |

---

## Adding a provider

One new file, one line in the registry. Full walkthrough and the rules an
adapter must follow: [PROVIDERS.md](PROVIDERS.md#adding-a-provider).

```ts
export const ExampleProvider: VideoProvider = {
  name: "Example",
  info: { /* documentation shown by GET /api/providers */ },
  canHandle: (url) => url.hostname === "example.com",
  resolve: async (url, context) => ({ sources: [/* … */] }),
};
```

Then add it to `providers` in `src/lib/resolver/registry.ts`, before
`GenericProvider`. Nothing else changes.

---

## HLS playback and CORS

`VideoPlayer` picks a playback path per source type:

| Type | Path |
| --- | --- |
| `mp4`, `webm` | `<video src>` directly |
| `hls` | Native HLS on Safari, otherwise **hls.js** via MSE |
| `dash` | **dash.js** |

hls.js and dash.js are imported dynamically, so neither is in the initial
bundle. The hls.js instance is destroyed on unmount and whenever the source
changes; network and media errors get one bounded recovery attempt each before
the player gives up and says why.

### CORS is the failure you will actually hit

Streams are played **directly from the origin CDN**. Nothing is proxied through
this server, and there is deliberately no generic CORS proxy — that would turn
the app into an open relay for other people's bandwidth.

The consequence: **MSE playback requires the media server to allow this
origin.**

- **MP4 / WebM** via `<video src>` are *not* subject to CORS. They usually just
  work.
- **HLS via hls.js** and **DASH via dash.js** fetch segments with XHR, which
  *is* subject to CORS. If the CDN does not send
  `Access-Control-Allow-Origin`, the browser blocks it and the player reports a
  CORS-related error rather than a silent black frame.
- **Native HLS on Safari** is not subject to CORS in the same way, so a stream
  can play on Safari and fail on Chrome.

For a media server you control, the required response headers are:

```
Access-Control-Allow-Origin: https://your-app.example
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Range, Origin, Accept
Access-Control-Expose-Headers: Content-Length, Content-Range
```

`Range` matters — without it, seeking breaks.

---

## Security

### SSRF

The resolver fetches URLs chosen by whoever is using the app, so every
destination is checked before a connection opens — the entry URL *and* every
redirect hop.

Refused: loopback, `0.0.0.0/8`, RFC1918 private ranges, CGNAT `100.64/10`,
link-local `169.254/16` (which is where the cloud metadata endpoints live),
multicast, reserved and test ranges, IPv6 loopback/ULA/link-local/multicast,
and the internal hostname patterns (`localhost`, single-label hosts, `.local`,
`.internal`, `metadata.google.internal`, …).

IPv6 is fully expanded rather than string-matched, so `::1`,
`0:0:0:0:0:0:0:1`, `::ffff:127.0.0.1`, `2002:7f00:1::` (6to4) and
`64:ff9b::169.254.169.254` (NAT64) all reach the same verdict. A hostname is
refused if **any** of its resolved addresses is private.

Redirects are followed by hand — `redirect: "manual"` — precisely so each hop
can be re-checked. A public URL that 302s to `169.254.169.254` is stopped at
the second hop, and the test suite asserts that.

> **Known residual risk — DNS rebinding.** The address check happens at lookup
> time; the connection happens a moment later. An attacker controlling a DNS
> server can in principle answer differently between the two. Closing that gap
> needs connection-level pinning (a custom `undici` agent with a `lookup` hook).
> If you deploy this somewhere with sensitive internal services, set
> `ALLOWED_EMBED_HOSTS` — an allowlist is not affected by rebinding.

### Other protections

- **Request validation** — Zod, strict mode: unknown fields are rejected, the
  field is length-capped, and only `http(s)` survives.
- **Response limits** — bodies are read through a byte cap; the redirect chain
  is bounded; the whole resolution shares a time budget.
- **Credentials in URLs** (`https://user:pass@host/`) are refused.
- **Rate limiting** on `POST /api/resolve`, with `Retry-After` and
  `X-RateLimit-*` headers.
- **Log redaction** — URLs are sanitized before logging: credentials stripped,
  `token`/`signature`/`policy`/`expires`/`hdnts`-style parameters masked. Signed
  CDN URLs are bearer credentials and are never logged raw.
- **No error leakage** — clients get a safe message and a code; detail stays in
  the server log.
- **Caching** is in-process and short-lived, so temporary signed URLs are never
  persisted.

### What this project will not do

No DRM decryption, no stolen cookies, no paywall or CAPTCHA bypass, no token
cracking, no anti-bot evasion. The outbound `User-Agent` identifies this tool
honestly instead of impersonating a browser: a site that refuses it is telling
us not to resolve it, and that answer is respected. When a page is behind a
sign-in or a challenge, the resolver detects it and says so rather than trying
harder.

---

## Deployment

Any Node.js host — the API route needs the Node runtime for DNS lookups, so it
is not edge-compatible.

```bash
npm run build
npm start
```

Before going to production:

1. **Set `ALLOWED_EMBED_HOSTS`.** The open default is convenient for
   development; an allowlist is the right posture for a deployment, and it also
   neutralizes the DNS-rebinding gap above.
2. **Put a shared rate limiter in front.** The built-in limiter is per-process
   memory; behind several instances each keeps its own count.
3. **Check the forwarding headers.** `X-Forwarded-For` is trusted for client
   identity. If the app is exposed directly rather than behind a proxy, that
   header is spoofable and the limiter should key on something else.
4. **Keep `ALLOW_PRIVATE_NETWORK=false`.** It disables the SSRF checks
   entirely.
5. **Leave `ENABLE_BROWSER_RESOLVER=false`** unless you need it, and give it a
   CPU/memory budget if you do.

The resolved-source cache is per-instance memory. That is fine — it is a cache,
not a store — but it is not shared, and it is intentionally not durable.
