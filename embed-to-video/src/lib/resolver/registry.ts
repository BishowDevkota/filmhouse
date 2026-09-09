/**
 * The provider registry.
 *
 * Adding support for a new site means writing one file in `src/lib/providers/`
 * and adding it to this list. Nothing else in the application changes.
 *
 * Order is significant — the first adapter whose `canHandle` returns true wins:
 *
 *  1. `Restricted` first, so a policy refusal cannot be sidestepped by a URL
 *     that also looks like direct media.
 *  2. Specific adapters next.
 *  3. `DirectMedia` for URLs that are already a manifest or container.
 *  4. `Generic` last; it accepts everything, so it must stay at the end.
 */

import "server-only";

import { DirectMediaProvider } from "@/lib/providers/direct";
import { GenericProvider } from "@/lib/providers/generic";
import { InternetArchiveProvider } from "@/lib/providers/archive";
import { PeerTubeProvider } from "@/lib/providers/peertube";
import { RestrictedProvider } from "@/lib/providers/restricted";
import type { VideoProvider } from "@/lib/resolver/types";
import type { ProviderInfo } from "@/types/video";

export const providers: readonly VideoProvider[] = [
  RestrictedProvider,
  InternetArchiveProvider,
  PeerTubeProvider,
  DirectMediaProvider,
  GenericProvider,
];

/** The catch-all adapter, used when nothing more specific matches. */
export const genericProvider = GenericProvider;

/** Documentation for `GET /api/providers`. */
export function listProviderInfo(): ProviderInfo[] {
  return providers.map((provider) => provider.info);
}
