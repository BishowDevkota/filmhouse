import { Puzzle, ShieldCheck, Workflow } from "lucide-react";

import ResolvePanel from "@/components/ResolvePanel";
import { listProviderInfo } from "@/lib/resolver/registry";

/** The pipeline, in the order it actually runs. */
const PIPELINE = [
  "Validate URL",
  "Detect provider",
  "Fetch embed",
  "Extract sources",
  "Normalize",
  "Play natively",
];

export default function Home() {
  // Server component: the registry is read directly, with no API round trip.
  const providers = listProviderInfo();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-indigo-400 uppercase">
          <Workflow aria-hidden className="size-3.5" />
          Embed → native video
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          Universal Video Player
        </h1>

        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
          Paste an authorized embed URL. The server resolves it to a direct HLS, MP4, WebM or DASH
          stream and plays it in our own{" "}
          <code className="font-mono text-zinc-300">&lt;video&gt;</code> element — never by
          re-rendering the original iframe.
        </p>

        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[11px] text-zinc-600">
          {PIPELINE.map((step, index) => (
            <li key={step} className="flex items-center gap-1.5">
              <span className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-zinc-400">
                {step}
              </span>
              {index < PIPELINE.length - 1 ? <span aria-hidden>→</span> : null}
            </li>
          ))}
        </ol>
      </header>

      <main>
        <ResolvePanel />
      </main>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-300">Registered providers</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {providers.map((provider) => (
            <li
              key={provider.name}
              className="flex flex-col gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-zinc-200">{provider.name}</span>
                <span className="font-mono text-[10px] tracking-wide text-zinc-600 uppercase">
                  {provider.formats.length > 0 ? provider.formats.join(" · ") : "policy"}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-500">{provider.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-900 pt-6 text-xs text-zinc-600">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck aria-hidden className="size-3.5" />
          No DRM, paywall, CAPTCHA or access-control bypass.
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Puzzle aria-hidden className="size-3.5" />
          Add a provider by dropping one file into{" "}
          <code className="font-mono text-zinc-500">src/lib/providers/</code>
        </span>
      </footer>
    </div>
  );
}
