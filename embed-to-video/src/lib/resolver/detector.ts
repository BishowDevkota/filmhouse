/**
 * Provider detection.
 *
 * Detection is deterministic and offline: it looks only at the URL, never at
 * the page body or its title. That keeps the choice of adapter predictable and
 * testable, and means a page cannot talk the resolver into treating it as some
 * other provider.
 */

import "server-only";

import { genericProvider, providers as defaultProviders } from "@/lib/resolver/registry";
import type { VideoProvider } from "@/lib/resolver/types";

/**
 * The first provider that claims the URL, or the generic adapter.
 *
 * A provider that throws from `canHandle` is skipped rather than allowed to
 * break detection for everything else.
 */
export function detectProvider(
  url: URL,
  registry: readonly VideoProvider[] = defaultProviders,
): VideoProvider {
  for (const provider of registry) {
    try {
      if (provider.canHandle(url)) return provider;
    } catch {
      // A broken adapter must not take the whole registry down.
      continue;
    }
  }
  return genericProvider;
}
