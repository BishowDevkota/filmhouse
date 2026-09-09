/**
 * Which hosts this deployment is willing to resolve.
 *
 * Separate from SSRF: `ssrf.ts` answers "is this address safe to connect to",
 * this module answers "is this site one we are configured to resolve". The
 * default posture is open (any public host), because the useful configuration
 * varies per deployment; setting `ALLOWED_EMBED_HOSTS` switches to a strict
 * allowlist, which is what a production deployment should do.
 */

import "server-only";

import { config } from "@/lib/config";

export type PolicyDecision =
  { allowed: true } | { allowed: false; reason: "not_allowlisted" | "denylisted" };

/** `true` when `host` equals `pattern` or is a subdomain of it. */
export function hostMatches(host: string, pattern: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/\.$/, "");
  const normalizedPattern = pattern.toLowerCase().replace(/^\./, "").replace(/\.$/, "");
  if (!normalizedPattern) return false;
  return normalizedHost === normalizedPattern || normalizedHost.endsWith(`.${normalizedPattern}`);
}

export interface PolicyOptions {
  allowedHosts?: readonly string[];
  blockedHosts?: readonly string[];
}

/**
 * Apply the configured host policy. The denylist always wins over the
 * allowlist, so a broad allowlist can still carve out specific hosts.
 */
export function checkDomainPolicy(hostname: string, options: PolicyOptions = {}): PolicyDecision {
  const allowed = options.allowedHosts ?? config.allowedHosts;
  const blocked = options.blockedHosts ?? config.blockedHosts;

  if (blocked.some((pattern) => hostMatches(hostname, pattern))) {
    return { allowed: false, reason: "denylisted" };
  }

  if (allowed.length > 0 && !allowed.some((pattern) => hostMatches(hostname, pattern))) {
    return { allowed: false, reason: "not_allowlisted" };
  }

  return { allowed: true };
}

export const POLICY_REASON_MESSAGE: Record<"not_allowlisted" | "denylisted", string> = {
  not_allowlisted: "This deployment is not configured to resolve embeds from that host.",
  denylisted: "This deployment does not resolve embeds from that host.",
};
