/**
 * Shared media vocabulary for the platform.
 *
 * These types cross the server/client boundary: the resolver produces them and
 * the player consumes them. Keep this file free of any runtime dependency so it
 * can be imported from both environments.
 */

export type StreamType = "hls" | "mp4" | "webm" | "dash";

export interface StreamSource {
  /** Absolute, normalized, publicly fetchable media URL. */
  url: string;
  type: StreamType;
  mimeType?: string;
  /** Human label such as `1080p`, `master` or `auto`. */
  quality?: string;
  width?: number;
  height?: number;
  /** Bits per second, when the provider advertises it. */
  bitrate?: number;
  /** BCP-47 language tag of the primary audio track. */
  language?: string;
  /**
   * Headers the authorized CDN requires. Only populated by providers that
   * explicitly support it; the browser cannot set these on a `<video>` element,
   * so they are informational for server-side consumers.
   */
  headers?: Record<string, string>;
  /**
   * True when this source is an HLS master / DASH manifest that already carries
   * every variant. The player should let the ABR engine pick, not the user.
   */
  isMaster?: boolean;
}

export interface ResolveResult {
  success: boolean;
  provider?: string;
  originalUrl: string;
  sources: StreamSource[];
  title?: string;
  thumbnail?: string;
  /** Duration in seconds. */
  duration?: number;
  error?: string;
  /** Machine-readable failure reason, used by the UI to pick a message. */
  errorCode?: ResolveErrorCode;
}

export type ResolveErrorCode =
  | "invalid_url"
  | "blocked_url"
  | "unsupported_provider"
  | "no_source"
  | "network_error"
  | "timeout"
  | "provider_failure"
  | "rate_limited"
  | "invalid_request";

export interface ProviderInfo {
  name: string;
  /** Hostnames or hostname suffixes the adapter claims. */
  domains: string[];
  formats: StreamType[];
  requiresBrowser: boolean;
  description: string;
}
