/** Rendered instead of the catalogue when TMDB_ACCESS_TOKEN is not configured. */
export default function SetupNotice() {
  return (
    <div className="mx-auto max-w-2xl px-6 pt-32 pb-16">
      <h1 className="mb-2 text-3xl font-extrabold text-brand">
        One step left
      </h1>
      <p className="mb-8 text-neutral-300">
        The app is built and ready — it just needs a TMDB API token to load
        movies and trailers.
      </p>

      <ol className="space-y-4 text-neutral-200">
        <li>
          <span className="font-semibold">1.</span> Create a free account at{" "}
          <a
            href="https://www.themoviedb.org/signup"
            className="text-brand underline"
            target="_blank"
            rel="noreferrer"
          >
            themoviedb.org
          </a>
          .
        </li>
        <li>
          <span className="font-semibold">2.</span> Open{" "}
          <a
            href="https://www.themoviedb.org/settings/api"
            className="text-brand underline"
            target="_blank"
            rel="noreferrer"
          >
            Settings → API
          </a>{" "}
          and copy the <strong>API Read Access Token</strong> (the long string
          starting with <code className="rounded bg-white/10 px-1">eyJ</code>).
        </li>
        <li>
          <span className="font-semibold">3.</span> Paste it into{" "}
          <code className="rounded bg-white/10 px-1">.env.local</code>:
          <pre className="mt-2 overflow-x-auto rounded bg-black/60 p-3 text-sm text-neutral-300">
            TMDB_ACCESS_TOKEN=eyJhbGciOi...
          </pre>
        </li>
        <li>
          <span className="font-semibold">4.</span> Restart the dev server (
          <code className="rounded bg-white/10 px-1">npm run dev</code>).
        </li>
      </ol>
    </div>
  );
}
