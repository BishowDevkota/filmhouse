import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Minimal same-origin JSON passthrough for the keyless "Server" JSON APIs
 * (SuperEmbed, ezvidapi…). Several of them don't send CORS headers, so a
 * direct browser `fetch` would be blocked even when they're healthy. This
 * tiny route fetches on the server and hands the body back to the client.
 *
 * It only proxies http(s) URLs (never media segments or file bodies — just
 * the small JSON lookup). If you deploy publicly, set UPSTREAM_ALLOW_HOSTS to
 * a comma list of host suffixes to lock it down; empty allows any http(s).
 */

const TIMEOUT_MS = 8000;
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const ALLOW_SUFFIXES = (process.env.UPSTREAM_ALLOW_HOSTS ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

function hostAllowed(hostname: string): boolean {
  if (!ALLOW_SUFFIXES.length) return true;
  const host = hostname.toLowerCase();
  return ALLOW_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Missing ?url=" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "?url= must be an absolute URL" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) URLs are proxied" }, { status: 400 });
  }
  if (!hostAllowed(target.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  let response: Response;
  try {
    response = await fetch(target.toString(), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent": BROWSER_UA,
        accept: "application/json, text/plain, */*",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Upstream lookup failed" },
      { status: 502 },
    );
  }

  const body = await response.text();
  return new NextResponse(body, {
    status: response.ok ? 200 : response.status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}
