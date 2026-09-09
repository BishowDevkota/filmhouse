/**
 * Optional headless-browser fallback.
 *
 * Some authorized players build their source URL in JavaScript, so a static
 * fetch sees no media at all. When `ENABLE_BROWSER_RESOLVER` is on and
 * Playwright is installed, the page is rendered and the media requests it makes
 * on its own are recorded.
 *
 * What this deliberately does not do: it never logs in, never dismisses a
 * consent or CAPTCHA wall, never touches DRM, and never impersonates another
 * client to get past bot protection. It loads the page the way a visitor would
 * and observes. If the page will not play without defeating one of those, the
 * resolver reports failure instead.
 *
 * Playwright is an optional peer dependency: it is loaded through `createRequire`
 * so the bundler never tries to resolve it, and its absence is not an error.
 */

import "server-only";

import { createRequire } from "node:module";

import { config } from "@/lib/config";
import { isCandidateMediaUrl } from "@/lib/extraction/filters";
import { assertFetchable } from "@/lib/security/safe-fetch";
import type { ProviderPayload, RawSource } from "@/lib/resolver/types";
import type { Logger } from "@/lib/utils/logger";
import { sanitizeUrlForLog } from "@/lib/utils/urls";

/* Minimal structural types, so the project does not need Playwright's types. */
interface BrowserRequestLike {
  url(): string;
  resourceType(): string;
}
interface RouteLike {
  request(): BrowserRequestLike;
  abort(): Promise<void>;
  continue(): Promise<void>;
}
interface PageLike {
  route(pattern: string, handler: (route: RouteLike) => void | Promise<void>): Promise<void>;
  on(event: "request" | "response", handler: (target: BrowserRequestLike) => void): void;
  goto(url: string, options: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  title(): Promise<string>;
  evaluate<T>(fn: string): Promise<T>;
}
interface ContextLike {
  newPage(): Promise<PageLike>;
}
interface BrowserLike {
  newContext(options: Record<string, unknown>): Promise<ContextLike>;
  close(): Promise<void>;
}
interface PlaywrightModule {
  chromium: { launch(options: Record<string, unknown>): Promise<BrowserLike> };
}

let playwrightWarningIssued = false;

/** Load Playwright if it is installed. Returns `null` when it is not. */
function loadPlaywright(logger: Logger): PlaywrightModule | null {
  try {
    // `createRequire` keeps this opaque to the bundler, so an uninstalled
    // Playwright is a runtime no-op rather than a build failure.
    const require = createRequire(import.meta.url);
    return require("playwright") as PlaywrightModule;
  } catch {
    if (!playwrightWarningIssued) {
      playwrightWarningIssued = true;
      logger.warn({
        event: "browser_unavailable",
        detail: "ENABLE_BROWSER_RESOLVER is on but Playwright is not installed",
      });
    }
    return null;
  }
}

/** Resource types that cannot contain a video stream. */
const BLOCKED_RESOURCE_TYPES = new Set(["image", "stylesheet", "font", "media-source"]);

/**
 * Render `target` and collect the media URLs the page requests.
 *
 * @returns A payload of observed sources, or `null` when browser rendering is
 *          disabled or unavailable.
 */
export async function resolveWithBrowser(
  target: URL,
  logger: Logger,
): Promise<ProviderPayload | null> {
  if (!config.enableBrowserResolver) return null;

  const playwright = loadPlaywright(logger);
  if (!playwright) return null;

  // The rendered page is fetched by the browser, which bypasses `safeFetch`;
  // re-run the destination check here so the SSRF policy still holds.
  await assertFetchable(target, false);

  const started = Date.now();
  let browser: BrowserLike | null = null;
  const observed = new Map<string, RawSource>();

  try {
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "EmbedToVideo/1.0 (+authorized embed resolver)",
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    // Drop assets that cannot be the stream. Saves bandwidth and keeps the
    // observed set clean.
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (BLOCKED_RESOURCE_TYPES.has(request.resourceType())) {
        await route.abort().catch(() => {});
        return;
      }
      await route.continue().catch(() => {});
    });

    const record = (request: BrowserRequestLike) => {
      const raw = request.url();
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        return;
      }
      if (!isCandidateMediaUrl(url)) return;
      if (!observed.has(url.toString())) observed.set(url.toString(), { url: url.toString() });
    };

    page.on("request", record);
    page.on("response", record);

    await page.goto(target.toString(), {
      waitUntil: "domcontentloaded",
      timeout: config.browserTimeoutMs,
    });

    // Give the player a moment to request its manifest.
    await page.waitForTimeout(Math.min(5_000, config.browserTimeoutMs / 2));

    // The element may also carry a plain src that never hit the network.
    const domSources = await page
      .evaluate<string[]>(
        `Array.from(document.querySelectorAll("video, video source"))
           .map((el) => el.getAttribute("src"))
           .filter(Boolean)`,
      )
      .catch(() => [] as string[]);

    for (const value of domSources) {
      try {
        const url = new URL(value, target);
        if (isCandidateMediaUrl(url) && !observed.has(url.toString())) {
          observed.set(url.toString(), { url: url.toString() });
        }
      } catch {
        // Ignore unparseable values.
      }
    }

    const title = await page.title().catch(() => undefined);

    logger.info({
      event: "browser_render",
      url: sanitizeUrlForLog(target),
      sources: observed.size,
      duration: `${Date.now() - started}ms`,
    });

    return {
      sources: [...observed.values()],
      title: title?.trim() || undefined,
      baseUrl: target.toString(),
    };
  } catch (error) {
    logger.warn({
      event: "browser_render",
      url: sanitizeUrlForLog(target),
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    });
    return { sources: [...observed.values()], baseUrl: target.toString() };
  } finally {
    await browser?.close().catch(() => {});
  }
}
