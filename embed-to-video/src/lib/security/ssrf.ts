/**
 * SSRF protection: decide whether an address is safe to send a request to.
 *
 * The resolver fetches URLs chosen by whoever is using the app, so every
 * destination — the original URL *and* every redirect hop — has to be checked
 * against the private address space before a connection is made.
 *
 * IPv6 is handled by fully expanding the address rather than by matching text,
 * because `::1`, `0:0:0:0:0:0:0:1` and `::ffff:127.0.0.1` all have to reach the
 * same verdict.
 */

import "server-only";

import dns from "node:dns/promises";
import net from "node:net";

export type BlockReason =
  | "loopback"
  | "private"
  | "link_local"
  | "cgnat"
  | "multicast"
  | "reserved"
  | "unspecified"
  | "metadata_endpoint"
  | "internal_hostname"
  | "dns_failure"
  | "unresolvable";

export interface AddressVerdict {
  allowed: boolean;
  reason?: BlockReason;
  /** The address or hostname that produced the verdict. */
  subject?: string;
}

const ALLOWED: AddressVerdict = { allowed: true };

function blocked(reason: BlockReason, subject: string): AddressVerdict {
  return { allowed: false, reason, subject };
}

/* -------------------------------------------------------------------------- */
/* IPv4                                                                        */
/* -------------------------------------------------------------------------- */

/** Parse dotted-quad into four octets. Rejects any non-canonical spelling. */
export function parseIPv4(address: string): number[] | null {
  if (net.isIPv4(address) !== true) return null;
  const octets = address.split(".").map((part) => Number.parseInt(part, 10));
  return octets.length === 4 && octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

/**
 * Classify an IPv4 address. Everything outside the globally routable unicast
 * space is refused, including the cloud metadata range 169.254.0.0/16.
 */
export function classifyIPv4(octets: number[]): BlockReason | null {
  const [a, b] = octets;

  if (a === 0) return "unspecified";
  if (a === 127) return "loopback";
  if (a === 10) return "private";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  if (a === 169 && b === 254) return "link_local"; // includes 169.254.169.254
  if (a === 100 && b >= 64 && b <= 127) return "cgnat";
  if (a === 192 && b === 0 && octets[2] === 0) return "reserved"; // IETF protocol assignments
  if (a === 192 && b === 0 && octets[2] === 2) return "reserved"; // TEST-NET-1
  if (a === 192 && b === 88 && octets[2] === 99) return "reserved"; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return "reserved"; // benchmarking
  if (a === 198 && b === 51 && octets[2] === 100) return "reserved"; // TEST-NET-2
  if (a === 203 && b === 0 && octets[2] === 113) return "reserved"; // TEST-NET-3
  if (a >= 224 && a <= 239) return "multicast";
  if (a >= 240) return "reserved"; // includes 255.255.255.255 broadcast

  return null;
}

/* -------------------------------------------------------------------------- */
/* IPv6                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Expand any valid IPv6 spelling into eight 16-bit groups, resolving `::`
 * compression and a trailing embedded IPv4 literal.
 */
export function expandIPv6(address: string): number[] | null {
  if (net.isIPv6(address) !== true) return null;

  // Drop a zone index (`fe80::1%eth0`) before parsing.
  let text = address.toLowerCase().split("%")[0];

  // A trailing dotted-quad contributes the final two groups. Slice it off but
  // keep the colon before it so the `::` structure stays intact.
  let tail: number[] = [];
  const embedded = /:(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (embedded) {
    const octets = parseIPv4(embedded[1]);
    if (!octets) return null;
    tail = [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
    text = text.slice(0, embedded.index + 1);
  }

  const parts = text.split("::");
  if (parts.length > 2) return null; // more than one "::" is invalid

  const parseGroups = (segment: string): number[] =>
    segment
      .split(":")
      .filter((part) => part.length > 0)
      .map((part) => Number.parseInt(part, 16));

  const left = parseGroups(parts[0] ?? "");
  const right = parts.length === 2 ? parseGroups(parts[1]) : [];

  if ([...left, ...right].some((g) => !Number.isFinite(g) || g < 0 || g > 0xffff)) {
    return null;
  }

  let groups: number[];
  if (parts.length === 1) {
    groups = [...left, ...tail];
  } else {
    const fill = 8 - (left.length + right.length + tail.length);
    if (fill < 0) return null;
    groups = [...left, ...Array<number>(fill).fill(0), ...right, ...tail];
  }

  return groups.length === 8 ? groups : null;
}

/**
 * Classify an expanded IPv6 address. Addresses that embed IPv4 (mapped, 6to4,
 * NAT64) are unwrapped and judged by their IPv4 payload, since that is where
 * the request actually lands.
 */
export function classifyIPv6(groups: number[]): BlockReason | null {
  const isZero = (from: number, to: number) => groups.slice(from, to).every((group) => group === 0);

  const embeddedIPv4 = (): number[] => [
    groups[6] >> 8,
    groups[6] & 0xff,
    groups[7] >> 8,
    groups[7] & 0xff,
  ];

  // ::ffff:0:0/96 — IPv4-mapped.
  if (isZero(0, 5) && groups[5] === 0xffff) {
    return classifyIPv4(embeddedIPv4()) ?? null;
  }

  // ::/96 — deprecated IPv4-compatible.
  if (isZero(0, 6)) {
    if (groups[6] === 0 && groups[7] === 0) return "unspecified";
    if (groups[6] === 0 && groups[7] === 1) return "loopback";
    return classifyIPv4(embeddedIPv4()) ?? "reserved";
  }

  // 64:ff9b::/96 — NAT64 well-known prefix.
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && isZero(2, 6)) {
    return classifyIPv4(embeddedIPv4()) ?? null;
  }

  // 2002::/16 — 6to4 carries its IPv4 address in the next two groups.
  if (groups[0] === 0x2002) {
    const octets = [groups[1] >> 8, groups[1] & 0xff, groups[2] >> 8, groups[2] & 0xff];
    return classifyIPv4(octets) ?? "reserved";
  }

  if ((groups[0] & 0xfe00) === 0xfc00) return "private"; // fc00::/7 unique local
  if ((groups[0] & 0xffc0) === 0xfe80) return "link_local"; // fe80::/10
  if ((groups[0] & 0xff00) === 0xff00) return "multicast"; // ff00::/8
  if (groups[0] === 0x0100 && isZero(1, 4)) return "reserved"; // 100::/64 discard
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return "reserved"; // documentation

  return null;
}

/* -------------------------------------------------------------------------- */
/* Combined checks                                                             */
/* -------------------------------------------------------------------------- */

/** Verdict for a literal IP address. Returns `null` when input is not an IP. */
export function classifyIpLiteral(address: string): BlockReason | null | undefined {
  const v4 = parseIPv4(address);
  if (v4) return classifyIPv4(v4);

  const v6 = expandIPv6(address);
  if (v6) return classifyIPv6(v6);

  return undefined; // not an IP literal
}

/** Hostnames that name a cloud metadata service. */
const METADATA_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "metadata",
  "instance-data",
  "instance-data.ec2.internal",
  "nova.clouds.archive.ubuntu.com",
]);

/** Suffixes that can only name something inside a private network. */
const INTERNAL_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".home.arpa",
  ".corp",
  ".private",
  ".test",
  ".example",
  ".invalid",
];

/**
 * Reject hostnames that name an internal service before DNS is even consulted.
 * A single-label hostname (`router`, `localhost`) cannot be a public name.
 */
export function classifyHostname(hostname: string): BlockReason | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  if (!host) return "unresolvable";
  if (host === "localhost") return "loopback";
  if (METADATA_HOSTNAMES.has(host)) return "metadata_endpoint";
  if (host.endsWith(".internal") && host.includes("metadata")) return "metadata_endpoint";
  if (!host.includes(".")) return "internal_hostname";
  if (INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return "internal_hostname";

  return null;
}

/** Strip the brackets `URL.hostname` keeps around an IPv6 literal. */
export function unwrapHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

export interface HostCheckOptions {
  /** Escape hatch for local development only. Never enable in production. */
  allowPrivateNetwork?: boolean;
  /** Injectable resolver, so tests do not touch the network. */
  lookup?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  /** Cap on the DNS lookup itself. See `withTimeout` below. */
  lookupTimeoutMs?: number;
}

/**
 * A failing DNS lookup can sit for far longer than the resolver's own budget —
 * glibc retries against every nameserver before giving up, which is routinely
 * 20-40 seconds. `dns.lookup` takes no AbortSignal, so it is raced against a
 * timer instead; the lookup itself is left to finish and be discarded.
 */
const DEFAULT_LOOKUP_TIMEOUT_MS = 5_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("lookup_timeout")), ms);
        // Do not hold the process open for a lookup nobody is waiting on.
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function defaultLookup(hostname: string) {
  return dns.lookup(hostname, { all: true, verbatim: true });
}

/**
 * The full pre-flight check for one destination: hostname policy first, then
 * every address the name resolves to.
 *
 * Requiring *all* resolved addresses to be public (rather than just the first)
 * closes the trivial rebinding trick of returning one public and one private
 * answer. A determined DNS-rebinding attacker can still flip the answer between
 * this lookup and the connection; see the security notes in the README.
 */
export async function checkHost(
  hostname: string,
  options: HostCheckOptions = {},
): Promise<AddressVerdict> {
  const host = unwrapHostname(hostname);
  if (options.allowPrivateNetwork) return ALLOWED;

  const literal = classifyIpLiteral(host);
  if (literal !== undefined) {
    return literal ? blocked(literal, host) : ALLOWED;
  }

  const byName = classifyHostname(host);
  if (byName) return blocked(byName, host);

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await withTimeout(
      (options.lookup ?? defaultLookup)(host),
      options.lookupTimeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS,
    );
  } catch {
    return blocked("dns_failure", host);
  }

  if (!addresses.length) return blocked("unresolvable", host);

  for (const { address } of addresses) {
    const reason = classifyIpLiteral(address);
    if (reason) return blocked(reason, address);
    if (reason === undefined) return blocked("unresolvable", address);
  }

  return ALLOWED;
}

/** Copy for the client. Deliberately vague about which rule matched. */
export const BLOCK_REASON_MESSAGE: Record<BlockReason, string> = {
  loopback: "That address points back at this server.",
  private: "That address is inside a private network.",
  link_local: "That address is link-local and cannot be fetched.",
  cgnat: "That address is inside a carrier-private network.",
  multicast: "That address is a multicast address.",
  reserved: "That address is in a reserved range.",
  unspecified: "That address is not routable.",
  metadata_endpoint: "That host is a cloud metadata endpoint.",
  internal_hostname: "That hostname is internal to a private network.",
  dns_failure: "That hostname could not be resolved.",
  unresolvable: "That hostname could not be resolved to a usable address.",
};
