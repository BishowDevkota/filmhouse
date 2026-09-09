import { Server } from "lucide-react";

interface ProviderBadgeProps {
  provider: string;
  /** Optional detail shown after the name, e.g. the source format. */
  detail?: string;
}

/** Small label identifying which adapter produced the current result. */
export function ProviderBadge({ provider, detail }: ProviderBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-300">
      <Server aria-hidden className="size-3.5" />
      <span>{provider}</span>
      {detail ? <span className="text-indigo-400/60">· {detail}</span> : null}
    </span>
  );
}

export default ProviderBadge;
