"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Kickoff shown in the viewer's own timezone.
 *
 * The server has no idea where the viewer is, so it renders UTC and the client
 * renders local time. useSyncExternalStore is what makes that safe: React takes
 * the server snapshot during hydration and swaps to the client one immediately
 * after, so the two never disagree mid-hydration.
 */
function format(date: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(date));
}

/** The value never changes for a given date, so there is nothing to subscribe to. */
const noSubscribe = () => () => {};

export default function KickoffTime({
  date,
  className,
}: {
  /** Kickoff as epoch milliseconds. */
  date: number;
  className?: string;
}) {
  const local = useCallback(() => format(date), [date]);
  const utc = useCallback(() => `${format(date, "UTC")} UTC`, [date]);
  const label = useSyncExternalStore(noSubscribe, local, utc);

  return (
    <time dateTime={new Date(date).toISOString()} className={className}>
      {label}
    </time>
  );
}
