This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# ClipsHub

# ClipsHub

## Playback servers (no API keys)

Each title's watch page shows a row of server buttons **just above the player**,
labelled simply **Server 1 .. Server 7** (hover a button to see its provider).
Every server is an independent, keyless source for the same title and renders
the provider's own player in an iframe:

| Button | Provider   | Base URL (override)                    |
| ------ | ---------- | -------------------------------------- |
| Server 1 | VidSrc    | `https://vidsrc.link/embed` (`VIDSRC_BASE_URL`)    |
| Server 2 | SuperEmbed| `https://multiembed.mov` (`SUPEREMBED_BASE_URL`)  |
| Server 3 | VidKing   | `https://www.vidking.net` (`VIDKING_BASE_URL`)     |
| Server 4 | VidCore   | `https://vidcore.org` (`VIDCORE_BASE_URL`)         |
| Server 5 | YapGrid   | `https://yapgrid.com` (`YAPGRID_BASE_URL`)         |
| Server 6 | VidBolt   | `https://vidbolt.pro` (`VIDBOLT_BASE_URL`)         |
| Server 7 | 2Embed    | `https://www.2embed.cc` (`TWOEMBED_BASE_URL`)      |

Requests are keyed by TMDB id (plus season/episode on TV pages). URL shapes:

- Most hosts: `/{embed/}{movie|tv}/{id}[/{season}/{episode}]`.
- SuperEmbed: `multiembed.mov/?video_id={id}&tmdb=1[&s={season}&e={episode}]`
  (redirects to the streamingnow player).
- VidBolt: `/{movie|tv}/{id}[/{season}/{episode}]` (no `/embed` prefix).

Verified 2026-09 in-browser: VidSrc, SuperEmbed, VidKing, VidCore (artplayer),
YapGrid (plays 720p) and 2Embed load players; VidBolt loads but its source
requests were rate-limited during testing. Each host is still a free third-party
service that can go down or add ads at any time - set the matching `*_BASE_URL`
override in `.env.local` to point at a mirror.

> **Consumet** is a different architecture - a self-hosted resolver API that
> returns `{ sources: [{ url, quality, isM3U8 }] }` and takes provider-specific
> ids, not a TMDB-keyed iframe. Wire it in as a JSON server once you run your
> Consumet instance and pick a provider.

## Live sports (`/sports`)

Sports live at `/sports`, `/sports/{sport}` and `/sports/{sport}/{matchId}`, and
reuse the same `<WatchServerPlayer>` as the movie pages - so the Server 1..N bar,
fullscreen and the VAST pre-roll all behave identically.

Fixtures are nothing like TMDB titles: a match is a short-lived event and every
provider invents its own id for it. So one provider supplies the **schedule** and
the rest are joined onto it **by fixture title**, guarded by kickoff time (see
`sameFixture` in `lib/sports.ts`) - that time guard is what keeps game 2 of a
three-game series from picking up game 1's stream.

| Provider       | Role                | Key?  | Override                                |
| -------------- | ------------------- | ----- | --------------------------------------- |
| Streamed       | schedule + streams  | none  | `STREAMED_BASE_URL` (`https://streamed.pk`)        |
| EmbedSportex   | extra streams       | none  | `EMBEDSPORTEX_BASE_URL` (`https://api.esportex.site`) |
| SportSRC       | extra streams       | **yes** | `SPORTSRC_API_KEY`, `SPORTSRC_BASE_URL`          |
| The Stream Den | extra streams       | n/a   | `STREAMDEN_EMBED_URL` (URL template)               |
| VenueVault     | extra streams       | n/a   | `VENUEVAULT_EMBED_URL` (URL template)              |

Verified 2026-09: **Streamed** and **EmbedSportex** work with no signup and are
on by default - a Champions League fixture resolved 3 Streamed + 2 EmbedSportex
servers. The other three need configuring:

- **SportSRC** returns `401 Missing API Key` on everything except `?type=sports`.
  Get a free key at <https://sportsrc.org/v2/> and set `SPORTSRC_API_KEY`. Its
  free tier is football-only, and because the response shape for `?type=detail`
  is undocumented, `lib/sports.ts` scans the payload for embeddable URLs rather
  than reading named fields - **this path is unverified without a key.**
- **The Stream Den** (503) and **VenueVault** (522 origin down) were both
  unreachable and publish no API, so nothing about their URLs is guessed. Each
  stays a greyed-out button until you set its env var to that site's embed URL,
  using `{slug}`, `{id}`, `{title}` or `{sport}` as placeholders:

  ```bash
  # .env.local - example shapes only; use whatever the host actually serves
  STREAMDEN_EMBED_URL="https://thestreamden.com/embed/{slug}"
  VENUEVAULT_EMBED_URL="https://venuevault.live/watch/{slug}"
  ```

Every provider is optional and every lookup is failure-tolerant: a host that is
down, rate-limited or has changed shape contributes no servers and leaves the
rest of the page working.
# filmhouse
