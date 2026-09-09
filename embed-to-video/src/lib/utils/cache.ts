/**
 * In-process TTL cache with an LRU bound.
 *
 * Resolved sources are short-lived by nature: many providers hand out signed
 * URLs that expire. The TTL is deliberately short and configurable, and nothing
 * is written to disk — see the caching note in the README.
 *
 * This is per-instance memory. Behind several server instances each one keeps
 * its own copy, which is fine for a cache but means it is not a shared store.
 */

import "server-only";

interface Entry<T> {
  value: T;
  /** Epoch milliseconds after which the entry is dead. */
  expiresAt: number;
}

export interface CacheOptions {
  ttlSeconds: number;
  maxEntries: number;
  /** Injectable clock, so tests do not have to sleep. */
  now?: () => number;
}

export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor({ ttlSeconds, maxEntries, now = Date.now }: CacheOptions) {
    this.ttlMs = Math.max(0, ttlSeconds) * 1000;
    this.maxEntries = Math.max(1, maxEntries);
    this.now = now;
  }

  get(key: string): T | undefined {
    if (this.ttlMs === 0) return undefined;

    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh recency for the LRU bound.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.ttlMs === 0) return;

    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });

    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
    }
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Entry count including any not-yet-evicted expired entries. */
  get size(): number {
    return this.store.size;
  }
}
