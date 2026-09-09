/**
 * Noise filtering shared by the static scanner and the browser resolver.
 *
 * Player pages are full of URLs that look media-ish but are not the video:
 * advertising creatives, analytics beacons, tracking pixels and preview
 * sprites. Returning one of those to the player is worse than returning
 * nothing, so they are dropped before normalization.
 */

/** Hostname fragments belonging to ad, analytics and tracking services. */
const NOISE_HOST_FRAGMENTS = [
  "doubleclick",
  "googlesyndication",
  "googletagmanager",
  "google-analytics",
  "googleadservices",
  "adservice",
  "adsystem",
  "adnxs",
  "adsrvr",
  "amazon-adsystem",
  "criteo",
  "taboola",
  "outbrain",
  "scorecardresearch",
  "quantserve",
  "moatads",
  "imasdk",
  "segment.io",
  "segment.com",
  "mixpanel",
  "hotjar",
  "sentry.io",
  "newrelic",
  "facebook.net",
  "connect.facebook",
  "analytics",
  "telemetry",
  "pixel",
  "tracker",
  "tracking",
  "beacon",
  "popads",
  "propellerads",
  "exoclick",
  "juicyads",
  "hilltopads",
  "vast",
  "vpaid",
];

/** Path fragments that mark a non-programme asset. */
const NOISE_PATH_FRAGMENTS = [
  "/ads/",
  "/ad/",
  "/advert",
  "/preroll",
  "/midroll",
  "/postroll",
  "/bumper",
  "/sprite",
  "/thumbnail",
  "/thumbs/",
  "/preview/",
  "/trailer-ad",
  "/analytics",
  "/collect",
  "/beacon",
  "/pixel",
  "/track",
];

/** Extensions that are never a playable programme stream. */
const NOISE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".svg",
  ".ico",
  ".css",
  ".js",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".json",
  ".xml",
  ".txt",
  ".html",
  ".htm",
  ".vtt",
  ".srt",
];

/**
 * True when the URL is advertising, analytics or a non-video asset.
 *
 * Deliberately conservative on the media side: it only rejects on clear
 * signals, because a false positive silently loses the real stream.
 */
export function isNoiseUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (NOISE_HOST_FRAGMENTS.some((fragment) => host.includes(fragment))) return true;
  if (NOISE_EXTENSIONS.some((extension) => path.endsWith(extension))) return true;
  if (NOISE_PATH_FRAGMENTS.some((fragment) => path.includes(fragment))) return true;

  return false;
}

/**
 * True for a media URL worth keeping: a recognized container or manifest that
 * is not obvious noise.
 */
export function isCandidateMediaUrl(url: URL): boolean {
  if (isNoiseUrl(url)) return false;
  return /\.(m3u8|m3u|mp4|m4v|webm|mpd)(\?|#|$)/i.test(url.pathname + url.search);
}
