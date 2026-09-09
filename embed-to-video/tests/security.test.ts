import { describe, expect, it } from "vitest";

import {
  checkHost,
  classifyHostname,
  classifyIpLiteral,
  expandIPv6,
  unwrapHostname,
} from "@/lib/security/ssrf";

describe("expandIPv6", () => {
  it("expands compressed addresses to eight groups", () => {
    expect(expandIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIPv6("::")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(expandIPv6("2001:db8::1")).toEqual([0x2001, 0x0db8, 0, 0, 0, 0, 0, 1]);
  });

  it("expands an uncompressed address", () => {
    expect(expandIPv6("0:0:0:0:0:0:0:1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("folds a trailing IPv4 literal into the last two groups", () => {
    expect(expandIPv6("::ffff:127.0.0.1")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(expandIPv6("::ffff:192.168.1.1")).toEqual([0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0101]);
    expect(expandIPv6("64:ff9b::169.254.169.254")).toEqual([
      0x64, 0xff9b, 0, 0, 0, 0, 0xa9fe, 0xa9fe,
    ]);
    expect(expandIPv6("0:0:0:0:0:ffff:127.0.0.1")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
  });

  it("drops a zone index", () => {
    expect(expandIPv6("fe80::1%eth0")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("rejects non-IPv6 input", () => {
    expect(expandIPv6("127.0.0.1")).toBeNull();
    expect(expandIPv6("not-an-ip")).toBeNull();
  });
});

describe("classifyIpLiteral", () => {
  it("blocks loopback", () => {
    expect(classifyIpLiteral("127.0.0.1")).toBe("loopback");
    expect(classifyIpLiteral("127.1.2.3")).toBe("loopback");
    expect(classifyIpLiteral("::1")).toBe("loopback");
  });

  it("blocks the unspecified address", () => {
    expect(classifyIpLiteral("0.0.0.0")).toBe("unspecified");
    expect(classifyIpLiteral("::")).toBe("unspecified");
  });

  it("blocks RFC1918 private ranges", () => {
    expect(classifyIpLiteral("10.0.0.1")).toBe("private");
    expect(classifyIpLiteral("172.16.0.1")).toBe("private");
    expect(classifyIpLiteral("172.31.255.255")).toBe("private");
    expect(classifyIpLiteral("192.168.1.1")).toBe("private");
    expect(classifyIpLiteral("fd00::1")).toBe("private");
  });

  it("allows public addresses that neighbour private ranges", () => {
    expect(classifyIpLiteral("172.15.0.1")).toBeNull();
    expect(classifyIpLiteral("172.32.0.1")).toBeNull();
    expect(classifyIpLiteral("11.0.0.1")).toBeNull();
    expect(classifyIpLiteral("8.8.8.8")).toBeNull();
    expect(classifyIpLiteral("2606:4700::1111")).toBeNull();
  });

  it("blocks cloud metadata endpoints", () => {
    expect(classifyIpLiteral("169.254.169.254")).toBe("link_local");
    expect(classifyIpLiteral("fe80::1")).toBe("link_local");
  });

  it("blocks carrier-grade NAT and reserved ranges", () => {
    expect(classifyIpLiteral("100.64.0.1")).toBe("cgnat");
    expect(classifyIpLiteral("100.100.100.200")).toBe("cgnat");
    expect(classifyIpLiteral("224.0.0.1")).toBe("multicast");
    expect(classifyIpLiteral("255.255.255.255")).toBe("reserved");
    expect(classifyIpLiteral("198.18.0.1")).toBe("reserved");
  });

  it("sees through IPv6 encodings of a private IPv4 address", () => {
    expect(classifyIpLiteral("::ffff:127.0.0.1")).toBe("loopback");
    expect(classifyIpLiteral("::ffff:169.254.169.254")).toBe("link_local");
    expect(classifyIpLiteral("::ffff:10.0.0.1")).toBe("private");
    expect(classifyIpLiteral("2002:7f00:1::")).toBe("loopback"); // 6to4 wrapping 127.0.0.1
    expect(classifyIpLiteral("64:ff9b::169.254.169.254")).toBe("link_local"); // NAT64
  });

  it("returns undefined for input that is not an IP literal", () => {
    expect(classifyIpLiteral("example.com")).toBeUndefined();
  });
});

describe("classifyHostname", () => {
  it("blocks localhost and single-label hosts", () => {
    expect(classifyHostname("localhost")).toBe("loopback");
    expect(classifyHostname("router")).toBe("internal_hostname");
  });

  it("blocks internal suffixes", () => {
    expect(classifyHostname("printer.local")).toBe("internal_hostname");
    expect(classifyHostname("db.internal")).toBe("internal_hostname");
    expect(classifyHostname("api.corp")).toBe("internal_hostname");
  });

  it("blocks metadata hostnames", () => {
    expect(classifyHostname("metadata.google.internal")).toBe("metadata_endpoint");
    expect(classifyHostname("metadata")).toBe("metadata_endpoint");
  });

  it("allows ordinary public hostnames", () => {
    expect(classifyHostname("cdn.example.com")).toBeNull();
    expect(classifyHostname("example.com.")).toBeNull();
  });
});

describe("checkHost", () => {
  const lookup = (map: Record<string, string[]>) => async (hostname: string) => {
    const addresses = map[hostname];
    if (!addresses) throw new Error("ENOTFOUND");
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };

  it("allows a hostname that resolves to public addresses", async () => {
    const verdict = await checkHost("cdn.example.com", {
      lookup: lookup({ "cdn.example.com": ["93.184.216.34"] }),
    });
    expect(verdict.allowed).toBe(true);
  });

  it("blocks a hostname that resolves to a private address", async () => {
    const verdict = await checkHost("evil.example.com", {
      lookup: lookup({ "evil.example.com": ["10.0.0.5"] }),
    });
    expect(verdict).toMatchObject({ allowed: false, reason: "private" });
  });

  it("blocks when any resolved address is private", async () => {
    const verdict = await checkHost("mixed.example.com", {
      lookup: lookup({ "mixed.example.com": ["93.184.216.34", "127.0.0.1"] }),
    });
    expect(verdict).toMatchObject({ allowed: false, reason: "loopback" });
  });

  it("blocks a hostname that fails to resolve", async () => {
    const verdict = await checkHost("nope.example.com", { lookup: lookup({}) });
    expect(verdict).toMatchObject({ allowed: false, reason: "dns_failure" });
  });

  it("gives up on a lookup that hangs past the timeout", async () => {
    // A failing resolver can sit for tens of seconds; the check must not.
    const hang = () => new Promise<never>(() => {});
    const started = Date.now();

    const verdict = await checkHost("slow.example.com", {
      lookup: hang,
      lookupTimeoutMs: 50,
    });

    expect(verdict).toMatchObject({ allowed: false, reason: "dns_failure" });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("checks IP literals without touching DNS", async () => {
    const explode = async () => {
      throw new Error("DNS should not be consulted for a literal");
    };
    expect(await checkHost("127.0.0.1", { lookup: explode })).toMatchObject({
      allowed: false,
      reason: "loopback",
    });
    expect(await checkHost("[::1]", { lookup: explode })).toMatchObject({
      allowed: false,
      reason: "loopback",
    });
  });
});

describe("unwrapHostname", () => {
  it("strips brackets from an IPv6 hostname", () => {
    expect(unwrapHostname("[::1]")).toBe("::1");
    expect(unwrapHostname("example.com")).toBe("example.com");
  });
});
