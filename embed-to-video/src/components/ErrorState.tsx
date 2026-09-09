"use client";

import { CircleAlert, RotateCcw, ShieldCheck, Unplug, VideoOff } from "lucide-react";
import type { ComponentType } from "react";

import type { ResolveErrorCode } from "@/types/video";

interface ErrorStateProps {
  code?: ResolveErrorCode;
  /** Message from the API. Preferred over the generic copy when present. */
  message?: string;
  onRetry?: () => void;
}

interface Presentation {
  heading: string;
  hint: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone: "neutral" | "warning" | "policy";
}

/**
 * Copy for each failure mode. The API's own message is shown as the detail
 * line; this supplies the heading and a hint about what to do next.
 */
const PRESENTATION: Record<ResolveErrorCode, Presentation> = {
  no_source: {
    heading: "No playable source found",
    hint: "The page did not declare a video file this resolver can read. It may build its player entirely in script — try enabling the browser resolver.",
    icon: VideoOff,
    tone: "neutral",
  },
  unsupported_provider: {
    heading: "Provider not supported",
    hint: "This platform is refused on purpose. Use its official embed instead.",
    icon: ShieldCheck,
    tone: "policy",
  },
  network_error: {
    heading: "Unable to reach the provider",
    hint: "The embed host did not respond, or returned an error. Check the URL and try again.",
    icon: Unplug,
    tone: "warning",
  },
  timeout: {
    heading: "The provider timed out",
    hint: "Resolution took longer than the configured budget. Try again, or raise RESOLVER_TIMEOUT_MS.",
    icon: Unplug,
    tone: "warning",
  },
  blocked_url: {
    heading: "That address is blocked",
    hint: "Private, internal and metadata addresses are never fetched.",
    icon: ShieldCheck,
    tone: "policy",
  },
  invalid_url: {
    heading: "That URL could not be read",
    hint: "Paste an http(s) embed URL, or the full <iframe> tag.",
    icon: CircleAlert,
    tone: "neutral",
  },
  invalid_request: {
    heading: "Invalid request",
    hint: "The request body was not in the expected shape.",
    icon: CircleAlert,
    tone: "neutral",
  },
  rate_limited: {
    heading: "Too many requests",
    hint: "You have hit the rate limit for this deployment. Wait a moment and try again.",
    icon: CircleAlert,
    tone: "warning",
  },
  provider_failure: {
    heading: "Resolution failed",
    hint: "The provider adapter could not complete. This has been logged on the server.",
    icon: CircleAlert,
    tone: "warning",
  },
};

const TONE_CLASSES: Record<Presentation["tone"], string> = {
  neutral: "border-zinc-800 bg-zinc-900/50 text-zinc-400",
  warning: "border-amber-900/60 bg-amber-950/20 text-amber-300/80",
  policy: "border-indigo-900/60 bg-indigo-950/20 text-indigo-300/80",
};

const ICON_TONE: Record<Presentation["tone"], string> = {
  neutral: "text-zinc-400",
  warning: "text-amber-400",
  policy: "text-indigo-400",
};

export function ErrorState({ code, message, onRetry }: ErrorStateProps) {
  const presentation = PRESENTATION[code ?? "provider_failure"];
  const Icon = presentation.icon;

  return (
    <div
      role="alert"
      className={`flex flex-col items-center gap-3 rounded-2xl border px-6 py-12 text-center ${TONE_CLASSES[presentation.tone]}`}
    >
      <Icon aria-hidden className={`size-7 ${ICON_TONE[presentation.tone]}`} />
      <p className="text-sm font-semibold text-zinc-100">{presentation.heading}</p>
      {message ? <p className="max-w-md text-sm text-zinc-300">{message}</p> : null}
      <p className="max-w-md text-xs leading-relaxed opacity-80">{presentation.hint}</p>

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      ) : null}
    </div>
  );
}

export default ErrorState;
