"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectAdBlock } from "@/lib/adblock";

/** How long the dialog disappears before popping back on a failed re-check. */
const REPLAY_MS = 220;

type Status = "checking" | "clear" | "blocked";

/**
 * Blocks the page with a centred dialog while an ad blocker is detected.
 * "OK" re-runs the detection: still blocked means the dialog comes straight
 * back, so the only way past it is to actually turn the blocker off.
 */
export default function AdBlockGate() {
  const [status, setStatus] = useState<Status>("checking");
  const [verifying, setVerifying] = useState(false);
  /** Bumped on every failed re-check: remounts the panel to replay its animation. */
  const [attempt, setAttempt] = useState(0);
  const [replaying, setReplaying] = useState(false);

  const okButtonRef = useRef<HTMLButtonElement>(null);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    detectAdBlock().then((blocked) => {
      if (active) setStatus(blocked ? "blocked" : "clear");
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (replayTimer.current) clearTimeout(replayTimer.current);
    },
    [],
  );

  const recheck = useCallback(async () => {
    setVerifying(true);
    const stillBlocked = await detectAdBlock();
    setVerifying(false);

    if (!stillBlocked) {
      setStatus("clear");
      return;
    }

    // Hide, then bring the same notification back so the retry is visible.
    setReplaying(true);
    replayTimer.current = setTimeout(() => {
      setAttempt((n) => n + 1);
      setReplaying(false);
    }, REPLAY_MS);
  }, []);

  const open = status === "blocked";

  // The page underneath must not scroll while the gate is up.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Keep focus on the dialog: Escape and Tab must not take you behind it.
  useEffect(() => {
    if (!open) return;
    okButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        okButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, attempt, replaying]);

  // If the blocker gets switched off in another tab, let them back in on return.
  useEffect(() => {
    if (!open) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      detectAdBlock().then((blocked) => {
        if (!blocked) setStatus("clear");
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [open]);

  if (!open || replaying) return null;

  const retried = attempt > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-fade-in"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="adblock-gate-title"
      aria-describedby="adblock-gate-body"
    >
      <div
        key={attempt}
        className="w-full max-w-md rounded-xl border border-white/10 bg-brand-surface p-6 text-center shadow-2xl shadow-black/60 animate-modal-in sm:p-8"
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand/15 text-brand">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="h-7 w-7"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5" />
            <path d="M12 16.5h.01" />
          </svg>
        </div>

        <h2
          id="adblock-gate-title"
          className="mb-3 text-xl font-extrabold tracking-tight text-white sm:text-2xl"
        >
          {retried ? "Ad blocker still active" : "Ad blocker detected"}
        </h2>

        <p id="adblock-gate-body" className="mb-2 text-sm text-neutral-300">
          Please turn off the ad blocker to continue.
        </p>
        <p className="mb-6 text-xs text-neutral-500">
          {retried
            ? "Disable it for this site, reload the page, then press OK again."
            : "Ads keep Filmhouse TV free. Disable your blocker for this site, then press OK."}
        </p>

        <button
          ref={okButtonRef}
          type="button"
          onClick={recheck}
          disabled={verifying}
          className="w-full rounded-md bg-brand px-6 py-3 text-sm font-bold tracking-wide text-white transition-colors hover:bg-brand-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifying ? "Checking…" : "OK"}
        </button>
      </div>
    </div>
  );
}
