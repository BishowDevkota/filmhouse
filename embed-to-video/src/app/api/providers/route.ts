/**
 * GET /api/providers
 *
 * Documentation for every registered adapter: which domains it claims, which
 * formats it can return, and whether it needs browser rendering. The UI uses it
 * to tell people what is supported before they paste anything.
 */

import { listProviderInfo } from "@/lib/resolver/registry";
import { config } from "@/lib/config";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      providers: listProviderInfo(),
      browserResolverEnabled: config.enableBrowserResolver,
    },
    {
      headers: {
        // Static for a given deployment, but cheap enough to revalidate.
        "Cache-Control": "public, max-age=60",
      },
    },
  );
}
