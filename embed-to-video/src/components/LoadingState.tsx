import { LoaderCircle } from "lucide-react";

interface LoadingStateProps {
  title?: string;
  detail?: string;
}

/** Full-panel busy state, used while a resolve request is in flight. */
export function LoadingState({
  title = "Resolving video source…",
  detail = "Fetching the embed page and looking for an authorized stream.",
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-6 py-14 text-center"
    >
      <LoaderCircle aria-hidden className="size-7 animate-spin text-indigo-400" />
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <p className="max-w-sm text-xs leading-relaxed text-zinc-500">{detail}</p>
    </div>
  );
}

export default LoadingState;
