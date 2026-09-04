"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type HlsJs from "hls.js";
import type { StreamSource, WatchServer } from "@/lib/streaming";

/**
 * Server switcher + player.
 *
 * A row of "Server 1 … Server N" buttons sits just above the player. Each
 * server is a different source for the same title:
 *   embed → the source's own player in an <iframe>
 *   hls   → a direct .m3u8 fed to our built-in <video> through hls.js
 *   json  → an API we fetch; the playable URL is pulled out and played
 *
 * When no servers are configured (e.g. the trailer page) it degrades to the
 * legacy single source or a YouTube trailer, exactly like the old player.
 */

/** First clickable server; falls back to 0 so the bar still shows one "active". */
function firstEnabled(servers: WatchServer[]): number {
  const index = servers.findIndex((server) => server.enabled);
  return index === -1 ? 0 : index;
}

const KIND_LABEL: Record<WatchServer["kind"], string> = {
  embed: "Embed",
  hls: "HLS",
  json: "JSON API",
};

function isHls(url: string): boolean {
  return /\.m3u8(\?|#|$)/i.test(url);
}

const MEDIA_EXT = /\.(m3u8|mp4|webm)(\?|#|$)/i;

/** Every absolute http(s) URL found anywhere in a JSON payload, in order. */
function collectHttpUrls(json: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value) && !seen.has(value)) {
        seen.add(value);
        found.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };

  walk(json);
  return found;
}

/**
 * Decide what a JSON API result points at: a direct media file (play in
 * <video>) or a playback page (show in an <iframe>).
 */
function pickResult(urls: string[]): { media?: string; page?: string } {
  const media =
    urls.find((url) => isHls(url)) ??
    urls.find((url) => /\.(mp4|webm)/i.test(url));
  if (media) return { media };
  const page = urls.find((url) => !MEDIA_EXT.test(url));
  return page ? { page } : {};
}

/** Native HLS (Safari) or hls.js through Media Source Extensions. */
function HlsVideo({ url, label }: { url: string; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsJs | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }

    let cancelled = false;
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) {
        if (!cancelled) setFailed(true);
        return;
      }
      const hls = new Hls();
      hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setFailed(true);
        hls.destroy();
        hlsRef.current = null;
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    });

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [url]);

  return (
    <>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full"
        controls
        autoPlay
        playsInline
      />
      {failed ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center">
          <p className="text-sm text-neutral-300">
            {label} wouldn&apos;t start — the host may be blocking direct
            playback. Try another server.
          </p>
        </div>
      ) : null}
    </>
  );
}

/** JSON API server: fetch once, then play whatever it points at. */
function JsonServer({ apiUrl, label }: { apiUrl: string; label: string }) {
  const [result, setResult] = useState<{
    status: "loading" | "error" | "ready";
    media?: string;
    page?: string;
  }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setResult({ status: "loading" });
      try {
        // Fetch through our same-origin helper: the JSON APIs (SuperEmbed,
        // ezvidapi) often don't send CORS headers, which would block a direct
        // browser fetch even when they're healthy.
        const response = await fetch(
          `/api/upstream?url=${encodeURIComponent(apiUrl)}`,
          { headers: { accept: "application/json" } },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload: unknown = await response.json();
        const { media, page } = pickResult(collectHttpUrls(payload));
        if (cancelled) return;
        if (!media && !page) {
          setResult({ status: "error" });
        } else {
          setResult({ status: "ready", media, page });
        }
      } catch {
        if (!cancelled) setResult({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  if (result.status === "loading") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center">
        <span
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-brand"
        />
        <p className="text-sm text-neutral-300">Contacting {label}…</p>
      </div>
    );
  }
  if (result.status === "error") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center">
        <p className="text-sm text-neutral-300">
          {label} returned nothing playable (blocked, down, or no source for
          this title). Try another server.
        </p>
      </div>
    );
  }
  if (result.media) {
    return isHls(result.media) ? (
      <HlsVideo url={result.media} label={label} />
    ) : (
      <video
        className="absolute inset-0 h-full w-full"
        src={result.media}
        controls
        autoPlay
        playsInline
      />
    );
  }
  if (result.page) {
    return (
      <iframe
        className="absolute inset-0 h-full w-full"
        src={result.page}
        title={`${label} playback`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    );
  }
  return null;
}

function ServerBar({
  servers,
  active,
  onSelect,
}: {
  servers: WatchServer[];
  active: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Server">
      {servers.map((server, index) => {
        const selected = index === active;
        const tag = server.kindLabel ?? KIND_LABEL[server.kind];
        const title = server.enabled
          ? `${server.provider} — ${tag}`
          : `Not configured — set ${server.setupEnv ?? "the matching env var"} in .env.local`;
        return (
          <button
            key={server.number}
            type="button"
            disabled={!server.enabled}
            onClick={() => onSelect(index)}
            title={title}
            aria-pressed={selected}
            className={[
              "flex min-w-[92px] items-center justify-center rounded-xl border px-3 py-2 leading-tight transition",
              selected
                ? "border-brand bg-brand/20 text-white shadow-[0_0_20px_-6px_rgba(245,166,35,0.7)]"
                : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/25 hover:text-white",
              !server.enabled
                ? "cursor-not-allowed opacity-40 hover:border-white/10 hover:text-neutral-300"
                : "cursor-pointer",
            ].join(" ")}
          >
            <span className="text-xs font-bold tracking-[0.14em] uppercase">
              Server {server.number}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function WatchServerPlayer({
  servers,
  title,
  trailerKey,
  legacy,
}: {
  servers: WatchServer[];
  title: string;
  /** Dedicated-trailer fallback, shown only when nothing else is available. */
  trailerKey?: string | null;
  /** Legacy single source, used by pages that don't pass a server list. */
  legacy?: StreamSource | null;
}) {
  const [active, setActive] = useState(() => firstEnabled(servers));

  // If the server list changed (new title or episode) and the remembered pick
  // is no longer clickable, show the first enabled server instead. The state
  // itself stays put so clicking still targets the right index.
  const enabledExists = servers.some((server) => server.enabled);
  const shownActive =
    enabledExists && servers[active]?.enabled ? active : firstEnabled(servers);
  const server = servers[shownActive] ?? null;

  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  /**
   * Fullscreen the player. For an embed we fullscreen the <iframe> itself so
   * the host's own player (controls, Space, etc.) keeps working inside it;
   * otherwise (our own <video>, trailer fallback, empty box) we fullscreen the
   * stage. Falls back to the stage if the browser rejects the iframe request.
   */
  const toggleFullscreen = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const frame = stage.querySelector("iframe");
      if (frame && typeof frame.requestFullscreen === "function") {
        await frame.requestFullscreen();
      } else if (typeof stage.requestFullscreen === "function") {
        await stage.requestFullscreen();
      }
    } catch {
      // requestFullscreen can be rejected outside a user gesture.
    }
  }, []);

  // Keep the icon in sync when fullscreen is entered/left by any means
  // (Esc, a host player's own fullscreen button, the browser UI…).
  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Best-effort keyboard controls.
  //  • Space → play/pause our own <video>. For cross-origin embeds the host's
  //            player handles Space once it has focus (i.e. after you click
  //            it), which is a browser limitation — we can't reach inside.
  //  • F     → fullscreen. Works while this page has focus; once an embed
  //            itself is focused the browser routes keys to the host instead.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTyping(event.target)) return;

      if (event.code === "Space") {
        const video = stageRef.current?.querySelector("video");
        // Don't hijack Space when a button/link is focused — it must keep its
        // normal activation behaviour (e.g. switching servers on the bar).
        if (
          event.target instanceof HTMLElement &&
          event.target.closest("button, a, [role='button'], [role='link']")
        ) {
          return;
        }
        // The <video> element itself (and embed players) already answer Space
        // natively, so only step in when focus is elsewhere on the page.
        if (video && event.target !== video) {
          event.preventDefault();
          if (video.paused) void video.play().catch(() => {});
          else video.pause();
        } else if (!video && stageRef.current?.querySelector("iframe")) {
          // Embed visible but not focused: keep Space from scrolling the page.
          // The host player takes over once you click into it.
          event.preventDefault();
        }
        return;
      }

      if (event.code === "KeyF") {
        event.preventDefault();
        void toggleFullscreen();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleFullscreen]);

  const renderFrame = () => {
    if (enabledExists && server?.enabled) {
      const key = `${server.number}-${(server.url ?? server.apiUrl) ?? ""}`;
      if (server.kind === "embed" && server.url) {
        return (
          <iframe
            key={key}
            className="absolute inset-0 h-full w-full"
            src={server.url}
            title={`${title} — Server ${server.number} (${server.provider})`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        );
      }
      if (server.kind === "hls" && server.url) {
        return (
          <div key={key} className="absolute inset-0">
            <HlsVideo url={server.url} label={server.provider} />
          </div>
        );
      }
      if (server.kind === "json" && server.apiUrl) {
        return (
          <div key={key} className="absolute inset-0">
            <JsonServer apiUrl={server.apiUrl} label={server.provider} />
          </div>
        );
      }
      return null;
    }

    // No configured servers → legacy single source or the trailer.
    if (legacy && legacy.kind === "video") {
      return (
        <video
          className="absolute inset-0 h-full w-full"
          src={legacy.url}
          controls
          autoPlay
          playsInline
        />
      );
    }
    if (legacy) {
      return (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={legacy.url}
          title={`${title} — full playback`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      );
    }
    if (trailerKey) {
      return (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=0&rel=0&modestbranding=1&playsinline=1&controls=1`}
          title={`${title} trailer`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      );
    }
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
        <span aria-hidden className="text-3xl opacity-40">
          ▣
        </span>
        <p className="text-sm text-neutral-500">
          Nothing to play for this title yet.
        </p>
      </div>
    );
  };

  return (
    <div>
      {servers.length > 0 ? (
        <ServerBar
          servers={servers}
          active={shownActive}
          onSelect={setActive}
        />
      ) : null}

      <div className="relative">
        {/* Gold bloom that reads as light spilling off the screen. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-6 -inset-y-4 rounded-[2rem] bg-brand/20 opacity-60 blur-3xl"
        />
        <div
          ref={stageRef}
          className={[
            "group relative aspect-video w-full overflow-hidden bg-black shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]",
            // Fullscreen fills the screen edge-to-edge, so drop the rounding.
            isFullscreen ? "rounded-none" : "rounded-2xl ring-1 ring-white/15",
          ].join(" ")}
        >
          {renderFrame()}

          {/* Page-level fullscreen toggle, top-right so it never collides
              with the hosts' own bottom control bars. */}
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-label={
              isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"
            }
            title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
            className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/50 text-sm text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-black/70 hover:text-brand-bright"
          >
            {isFullscreen ? "🗗" : "⛶"}
          </button>
        </div>
      </div>
    </div>
  );
}
