# Providers

Every site this application can resolve is implemented as an independent
adapter in [`src/lib/providers/`](src/lib/providers/). Adapters are tried in
registry order and the first one whose `canHandle(url)` returns `true` wins.

Detection looks **only at the URL** — never at the page title or body — so the
adapter chosen for a given link is deterministic and testable.

| Provider | Matches | Formats | Method | Browser needed |
| --- | --- | --- | --- | --- |
| [Restricted](#restricted) | Named platforms | — | Policy refusal | No |
| [InternetArchive](#internetarchive) | `archive.org` | MP4, WebM | Public JSON API | No |
| [PeerTube](#peertube) | Any instance, by URL shape | HLS, MP4, WebM | Public REST API | No |
| [DirectMedia](#directmedia) | Any media URL | HLS, MP4, WebM, DASH | Pass-through | No |
| [Generic](#generic) | Everything else | HLS, MP4, WebM, DASH | HTML + script scan | Optional |

Registry order is defined in
[`src/lib/resolver/registry.ts`](src/lib/resolver/registry.ts). Two positions
are load-bearing: `Restricted` is **first** so a policy refusal cannot be
sidestepped by a URL that also looks like direct media, and `Generic` is
**last** because it accepts everything.

---

## Restricted

**File:** `src/lib/providers/restricted.ts`

**Domains:** YouTube, Vimeo, Dailymotion, Twitch, Facebook, Instagram, TikTok,
Netflix, Prime Video, Disney+, Hulu, Max, Spotify, Apple Music/TV.

**Supported formats:** none — this adapter never returns a source.

**Extraction method:** none. It matches these hosts on purpose and returns
`unsupported_provider` with an explanation.

**Browser rendering required:** no.

These platforms either protect their content with DRM or require, in their terms
of service, that playback happens in their own player. Extracting a stream URL
from them is exactly what this project refuses to do. Matching them explicitly
means the refusal is a clear, documented answer rather than an extraction
failure that looks like a bug.

This adapter sets `allowGenericFallback: false`, so a refusal is never quietly
worked around by the generic scanner.

**Known limitations:** the list is maintained by hand. A restricted platform
that is not listed will fall through to `Generic`, which will usually find
nothing — but do not rely on that as the enforcement mechanism. Add the domain
here instead.

---

## InternetArchive

**File:** `src/lib/providers/archive.ts`

**Domains:** `archive.org`, `web.archive.org` (and subdomains).

**Matches paths:** `/embed/{id}`, `/details/{id}`, `/download/{id}`,
`/stream/{id}`.

**Supported formats:** MP4, WebM.

**Extraction method:** the Archive's public metadata API,
`GET https://archive.org/metadata/{identifier}`. Every video derivative the item
publishes becomes a quality option, using the `height` the API reports. Titles,
duration and a thumbnail come from the same response.

**Browser rendering required:** no.

The Archive publishes this API for exactly this purpose, and its items are
public domain or openly licensed.

**Known limitations:**

- Ogg Video and MPEG-2 derivatives are skipped — browsers do not reliably play
  them. An item with only those returns `no_source`.
- Items marked `is_dark` (restricted by the Archive) are refused.
- The Archive publishes progressive files, not an adaptive manifest, so quality
  is chosen from the menu rather than by ABR.

---

## PeerTube

**File:** `src/lib/providers/peertube.ts`

**Domains:** any PeerTube instance. PeerTube is federated, so there is no domain
list — the adapter matches on URL *shape*:

- `/videos/embed/{id}`
- `/videos/watch/{id}`
- `/w/{shortId}`

**Supported formats:** HLS (master playlist), MP4, WebM.

**Extraction method:** PeerTube's documented public REST API,
`GET /api/v1/videos/{id}` on the same origin as the embed. The HLS master
playlist from `streamingPlaylists` is returned first — it carries every
rendition, so the player's ABR logic can choose — followed by any progressive
files.

Because any hostname can be an instance, the adapter confirms the response
actually looks like PeerTube (`uuid` or `name` present) before trusting it. If
it does not, resolution falls through to `Generic`.

**Browser rendering required:** no.

**Known limitations:**

- Private, password-protected and unlisted videos return an API error. This
  adapter does not authenticate, so those stay unresolved by design.
- Live streams are returned as their HLS playlist; duration will be absent.
- A non-PeerTube site using the same URL shape costs one wasted API request
  before falling back.

---

## DirectMedia

**File:** `src/lib/providers/direct.ts`

**Domains:** any host, when the URL already points at media.

**Supported formats:** HLS (`.m3u8`), MP4 (`.mp4`, `.m4v`), WebM, DASH
(`.mpd`).

**Extraction method:** none needed — the URL *is* the source. HLS URLs are
probed once to detect whether they are a master playlist, so the quality menu
can honestly show `Auto`.

**Browser rendering required:** no.

**Known limitations:** playback still depends on the media server permitting
this origin. See the CORS section in the [README](README.md#hls-playback-and-cors).

---

## Generic

**File:** `src/lib/providers/generic.ts`

**Domains:** every URL not claimed by a more specific adapter.

**Supported formats:** HLS, MP4, WebM, DASH.

**Extraction method:** fetch the page once, then read what it declares:

1. `<video src>`, `<video><source>`, and the `data-*` attributes open-source
   players use (`data-file`, `data-hls`, `data-mp4`, …), including `label`,
   `size` and `res` annotations for quality.
2. Open Graph video metadata (`og:video`, `og:video:secure_url`, and the
   width/height/type companions).
3. schema.org `VideoObject` JSON-LD (`contentUrl`, `name`, `thumbnailUrl`,
   `duration`).
4. `<link rel="preload" as="video">`.
5. Media URLs written into inline player configuration, including
   JSON-escaped (`https:\/\/…`), unicode-escaped (`/`) and
   HTML-entity-encoded forms, plus quality labels from object literals such as
   `{file: "…", label: "1080p"}`.

Nothing is executed and nothing is decrypted. Advertising, analytics and asset
URLs are filtered out before normalization (see
`src/lib/extraction/filters.ts`).

**Browser rendering required:** optional. If static reading finds nothing *and*
`ENABLE_BROWSER_RESOLVER=true` *and* Playwright is installed, the page is
rendered once and the media requests it makes on its own are observed.

**Known limitations:**

- A page that builds its source URL from an obfuscated or server-signed token
  will not resolve statically.
- If the page is behind a sign-in or a bot challenge, resolution stops and says
  so. It is never worked around.
- Quality labels are only as good as what the page declares.

---

## Adding a provider

Adding support for a site is one new file plus one line in the registry.

**1. Write the adapter** in `src/lib/providers/example.ts`:

```ts
import "server-only";

import type { ProviderPayload, ResolveContext, VideoProvider } from "@/lib/resolver/types";
import { hostMatches } from "@/lib/security/domain-policy";

export const ExampleProvider: VideoProvider = {
  name: "Example",

  info: {
    name: "Example",
    domains: ["example.com"],
    formats: ["hls"],
    requiresBrowser: false,
    description: "Resolved through Example's public player configuration API.",
  },

  // URL-only, deterministic, no network access.
  canHandle(url) {
    return hostMatches(url.hostname, "example.com") && url.pathname.startsWith("/embed/");
  },

  async resolve(url, context: ResolveContext): Promise<ProviderPayload> {
    const config = await context.fetchJson<{ hls: string; title: string }>(
      new URL(`/api/player/${url.pathname.split("/").pop()}`, url.origin),
      { signal: context.signal },
    );

    return {
      sources: [{ url: config.hls, type: "hls", isMaster: true }],
      title: config.title,
      baseUrl: url.origin,
    };
  },
};
```

**2. Register it** in `src/lib/resolver/registry.ts`, before `GenericProvider`:

```ts
export const providers: readonly VideoProvider[] = [
  RestrictedProvider,
  ExampleProvider, // ← here
  InternetArchiveProvider,
  PeerTubeProvider,
  DirectMediaProvider,
  GenericProvider,
];
```

**3. Document it** in this file, and add a detection test to
`tests/detector.test.ts`.

Nothing else in the application changes. No React component, route handler or
extraction module needs to know the provider exists.

### Rules for an adapter

- **Never fetch directly.** Use `context.fetchText` / `context.fetchJson`. They
  enforce the SSRF, redirect, timeout and size limits. A bare `fetch` bypasses
  all of it.
- **`canHandle` must not touch the network** and must not throw. A throwing
  adapter is skipped, but it should not need to be.
- **Return raw sources.** Relative, protocol-relative and escaped URLs are all
  fine — the normalizer resolves them. Do not deduplicate or sort.
- **Throw `ResolverError`** with an appropriate code for expected failures. Any
  other thrown value becomes `provider_failure`, and its message is never shown
  to the client.
- **Only add a provider where extraction is technically and legally
  appropriate.** If a site's terms require its own player, or its content is
  DRM-protected, it belongs in `restricted.ts` instead.
