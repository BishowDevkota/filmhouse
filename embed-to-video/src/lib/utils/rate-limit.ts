/**
 * Fixed-window rate limiter, in process memory.
 *
 * Enough to stop a single client from turning the resolver into a scraping
 * amplifier. A multi-instance deployment should put a shared store (Redis, or
 * the platform's own limiter) in front of this — see the README.
 */

import "server-only";

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  now?: () => number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch milliseconds at which the current window rolls over. */
  resetAt: number;
  /** Seconds to wait before retrying, when blocked. */
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor({ limit, windowSeconds, now = Date.now }: RateLimitOptions) {
    this.limit = Math.max(1, limit);
    this.windowMs = Math.max(1, windowSeconds) * 1000;
    this.now = now;
  }

  check(key: string): RateLimitVerdict {
    const timestamp = this.now();
    this.evictExpired(timestamp);

    const existing = this.windows.get(key);
    const window: Window =
      existing && existing.resetAt > timestamp
        ? existing
        : { count: 0, resetAt: timestamp + this.windowMs };

    window.count += 1;
    this.windows.set(key, window);

    const allowed = window.count <= this.limit;
    return {
      allowed,
      limit: this.limit,
      remaining: Math.max(0, this.limit - window.count),
      resetAt: window.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - timestamp) / 1000)),
    };
  }

  reset(): void {
    this.windows.clear();
  }

  /** Drop finished windows so an idle process does not grow without bound. */
  private evictExpired(timestamp: number): void {
    if (this.windows.size < 1000) return;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= timestamp) this.windows.delete(key);
    }
  }
}
