/**
 * Presentation helpers. Client-safe.
 */

/** `83` → `1:23`; `3723` → `1:02:03`. Non-finite input renders as `--:--`. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const pad = (value: number) => value.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** `4500000` → `4.5 Mbps`. */
export function formatBitrate(bitsPerSecond: number | undefined): string | null {
  if (!bitsPerSecond || !Number.isFinite(bitsPerSecond)) return null;
  if (bitsPerSecond >= 1_000_000) return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
  return `${Math.round(bitsPerSecond / 1000)} kbps`;
}

/** Hostname of a URL, for display. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Shorten a URL for display without hiding which host it points at. */
export function truncateUrl(url: string, max = 72): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 1)}…`;
}
