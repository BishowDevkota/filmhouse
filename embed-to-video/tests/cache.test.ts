import { describe, expect, it } from "vitest";

import { TtlCache } from "@/lib/utils/cache";
import { RateLimiter } from "@/lib/utils/rate-limit";

describe("TtlCache", () => {
  it("stores and returns a value", () => {
    const cache = new TtlCache<string>({ ttlSeconds: 60, maxEntries: 10 });
    cache.set("a", "value");
    expect(cache.get("a")).toBe("value");
    expect(cache.get("missing")).toBeUndefined();
  });

  it("expires entries once the TTL has passed", () => {
    let now = 1_000_000;
    const cache = new TtlCache<string>({ ttlSeconds: 5, maxEntries: 10, now: () => now });

    cache.set("a", "value");
    now += 4_900;
    expect(cache.get("a")).toBe("value");

    now += 200;
    expect(cache.get("a")).toBeUndefined();
  });

  it("evicts the least recently used entry past the bound", () => {
    const cache = new TtlCache<number>({ ttlSeconds: 60, maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);

    // Touching "a" makes "b" the least recently used.
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });

  it("is disabled when the TTL is zero", () => {
    const cache = new TtlCache<string>({ ttlSeconds: 0, maxEntries: 10 });
    cache.set("a", "value");
    expect(cache.get("a")).toBeUndefined();
  });
});

describe("RateLimiter", () => {
  it("allows requests up to the limit and blocks the rest", () => {
    const limiter = new RateLimiter({ limit: 3, windowSeconds: 60 });

    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    const third = limiter.check("ip");
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = limiter.check("ip");
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks each client separately", () => {
    const limiter = new RateLimiter({ limit: 1, windowSeconds: 60 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("starts a fresh window once the old one ends", () => {
    let now = 1_000_000;
    const limiter = new RateLimiter({ limit: 1, windowSeconds: 10, now: () => now });

    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);

    now += 10_001;
    expect(limiter.check("ip").allowed).toBe(true);
  });
});
