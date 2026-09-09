/**
 * The fallback adapter for ordinary embed pages.
 *
 * Fetches the page and reads what it declares: `<video>`/`<source>` elements,
 * Open Graph and schema.org metadata, and media URLs written into inline player
 * configuration. Nothing is executed and nothing is decrypted — if a page does
 * not say where its video is, this returns nothing and the caller reports that
 * honestly.
 *
 * When static reading finds nothing and browser rendering is enabled, the page
 * is rendered once and the media requests it makes are observed instead.
 */

import "server-only";

import { ResolverError } from "@/lib/resolver/errors";
import { extractFromHtml } from "@/lib/extraction/html";
import { extractFromJavaScript } from "@/lib/extraction/javascript";
import { isNoiseUrl } from "@/lib/extraction/filters";
import { annotateHlsSources } from "@/lib/extraction/manifest";
import type {
  ProviderPayload,
  RawSource,
  ResolveContext,
  VideoProvider,
} from "@/lib/resolver/types";
import { embedRequestHeaders } from "@/lib/utils/headers";
import { toAbsoluteUrl } from "@/lib/utils/urls";

/**
 * Markers of a page that will not reveal its video without defeating an access
 * control. Detected so the failure can be explained accurately rather than
 * reported as "no source found" — and so it is obvious that the correct
 * behaviour is to stop, not to try harder.
 */
const ACCESS_WALL_MARKERS = [
  "g-recaptcha",
  "grecaptcha",
  "h-captcha",
  "hcaptcha",
  "cf-turnstile",
  "cf-challenge",
  "challenge-platform",
  "data-sitekey",
  "widget_v4.js",
];

function looksLikeAccessWall(html: string): boolean {
  const sample = html.slice(0, 200_000).toLowerCase();
  return ACCESS_WALL_MARKERS.some((marker) => sample.includes(marker));
}

/** Drop candidates that resolve to advertising, analytics or page assets. */
function withoutNoise(sources: RawSource[], base: string): RawSource[] {
  return sources.filter((source) => {
    const url = toAbsoluteUrl(source.url, base);
    // Keep anything that will not resolve yet; the normalizer decides its fate.
    return url ? !isNoiseUrl(url) : true;
  });
}

export const GenericProvider: VideoProvider = {
  name: "Generic",

  info: {
    name: "Generic",
    domains: ["*"],
    formats: ["hls", "mp4", "webm", "dash"],
    requiresBrowser: false,
    description:
      "Fallback for any public embed page. Reads declared <video>/<source> elements, Open Graph and schema.org metadata, and media URLs present in inline player configuration. Optionally falls back to headless rendering when ENABLE_BROWSER_RESOLVER is set.",
  },

  canHandle() {
    // The registry only reaches this adapter after every specific one declines.
    return true;
  },

  async resolve(url, context: ResolveContext): Promise<ProviderPayload> {
    const response = await context.fetchText(url, {
      headers: embedRequestHeaders(url),
      enforceAllowlist: true,
      signal: context.signal,
    });

    // Redirects mean relative URLs must resolve against where we landed.
    const base = response.url.toString();
    const html = response.body;

    const fromHtml = extractFromHtml(html);
    const fromScripts = extractFromJavaScript(html);

    // HTML-declared sources come first: they carry the most reliable metadata,
    // so they win ties during deduplication.
    let sources = withoutNoise([...fromHtml.sources, ...fromScripts], base);

    context.logger.debug({
      event: "generic_scan",
      html: fromHtml.sources.length,
      script: fromScripts.length,
      kept: sources.length,
      truncated: response.truncated,
    });

    if (sources.length === 0) {
      const rendered = await context.renderInBrowser(url);
      if (rendered && rendered.sources.length > 0) {
        return {
          ...rendered,
          title: rendered.title ?? fromHtml.title,
          thumbnail: rendered.thumbnail ?? fromHtml.thumbnail,
          duration: rendered.duration ?? fromHtml.duration,
        };
      }

      if (looksLikeAccessWall(html)) {
        throw new ResolverError(
          "no_source",
          "That page is behind a sign-in or bot challenge. This resolver does not bypass access controls.",
          "access_wall_detected",
        );
      }
    }

    sources = await annotateHlsSources(sources, context);

    return {
      sources,
      baseUrl: base,
      title: fromHtml.title,
      thumbnail: fromHtml.thumbnail,
      duration: fromHtml.duration,
    };
  },
};
