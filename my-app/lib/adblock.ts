/**
 * Ad blocker detection, client-side only.
 *
 * Two independent signals, because blockers differ in what they do:
 *   1. Cosmetic filtering — a bait element carrying classic ad class names
 *      gets hidden or collapsed by the blocker's stylesheet.
 *   2. Network filtering — requests to the ad domains this site actually
 *      loads (see app/layout.tsx) never leave the browser.
 *
 * The network signal is only trusted after a same-origin request succeeds,
 * so a flaky connection or a dead ad host is not mistaken for a blocker.
 */

/** Class names every major filter list hides on sight. */
const BAIT_CLASSES =
  "adsbox ad-banner ads ad-placement pub_300x250 textads banner_ad sponsored-ad";

/** Ad scripts the site really requests; both are on the standard blocklists. */
const AD_PROBES = [
  "https://5gvci.com/act/files/tag.min.js?z=11723367",
  "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
];

/** Same-origin file used to prove the network itself is alive. */
const ONLINE_PROBE = "/logo.png";

const PROBE_TIMEOUT_MS = 4000;

/** Appends a decoy ad slot and reports whether something hid it. */
function baitIsHidden(): boolean {
  if (typeof document === "undefined" || !document.body) return false;

  const bait = document.createElement("div");
  bait.className = BAIT_CLASSES;
  bait.id = "ad-banner-slot";
  bait.setAttribute("data-ad-slot", "300x250");
  bait.style.cssText =
    "position:absolute;left:-9999px;top:-9999px;width:300px;height:250px;pointer-events:none;";
  document.body.appendChild(bait);

  const style = window.getComputedStyle(bait);
  const hidden =
    bait.offsetHeight === 0 ||
    bait.offsetWidth === 0 ||
    bait.clientHeight === 0 ||
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0";

  bait.remove();
  return hidden;
}

/** Resolves true when the request completed, false when it failed or timed out. */
async function requestSucceeds(url: string): Promise<boolean> {
  try {
    await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    // no-cors yields an opaque response: reaching here at all means the
    // request was allowed out, which is the only thing being measured.
    return true;
  } catch {
    return false;
  }
}

/** True only when every ad probe fails, so one dead host cannot trigger it. */
async function adRequestsAreBlocked(): Promise<boolean> {
  const results = await Promise.all(AD_PROBES.map(requestSucceeds));
  return results.every((succeeded) => !succeeded);
}

/**
 * Runs both checks. Returns false whenever the answer is uncertain — a
 * false "you have an ad blocker" is worse than a missed detection.
 */
export async function detectAdBlock(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (baitIsHidden()) return true;

  if (navigator.onLine === false) return false;

  // Cache-buster: a cached hit would pass even while the blocker is active.
  const online = await requestSucceeds(`${ONLINE_PROBE}?t=${Date.now()}`);
  if (!online) return false;

  return adRequestsAreBlocked();
}
