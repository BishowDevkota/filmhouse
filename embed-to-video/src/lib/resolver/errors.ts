/**
 * Typed failures shared by the fetcher, the providers and the API route.
 *
 * Every error that can reach the client carries a `ResolveErrorCode` and a
 * message that is safe to display. Internal detail (stack traces, the exact
 * SSRF rule that matched, upstream error text) stays on the server.
 */

import type { ResolveErrorCode } from "@/types/video";

export class ResolverError extends Error {
  readonly code: ResolveErrorCode;
  /** Message that may be shown to the client. */
  readonly publicMessage: string;
  /** Server-side only detail, for logs. */
  readonly detail?: string;

  constructor(code: ResolveErrorCode, publicMessage: string, detail?: string) {
    super(detail ? `${publicMessage} (${detail})` : publicMessage);
    this.name = "ResolverError";
    this.code = code;
    this.publicMessage = publicMessage;
    this.detail = detail;
  }
}

/** Narrow an unknown thrown value into something with a safe public message. */
export function toResolverError(error: unknown): ResolverError {
  if (error instanceof ResolverError) return error;

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return new ResolverError("timeout", "The provider took too long to respond.", error.name);
    }
    return new ResolverError(
      "provider_failure",
      "Provider resolution failed.",
      `${error.name}: ${error.message}`,
    );
  }

  return new ResolverError("provider_failure", "Provider resolution failed.", String(error));
}
