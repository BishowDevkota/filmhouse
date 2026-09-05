export function HeroSkeleton() {
  return (
    <div className="relative h-[56vw] max-h-[85vh] min-h-[520px] w-full animate-pulse bg-neutral-800">
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-brand-black to-transparent" />
      <div className="relative z-10 flex h-full max-w-2xl flex-col justify-end gap-4 px-4 pb-40 md:px-12 md:pb-52">
        <div className="h-12 w-2/3 rounded bg-neutral-700" />
        <div className="h-4 w-full rounded bg-neutral-700" />
        <div className="h-4 w-4/5 rounded bg-neutral-700" />
        <div className="h-12 w-full max-w-md rounded-full bg-neutral-700" />
      </div>
    </div>
  );
}

export function RowSkeleton({ title }: { title: string }) {
  return (
    <section>
      <h2 className="mb-2 px-4 text-lg font-semibold text-neutral-200 md:px-12 md:text-xl">
        {title}
      </h2>
      <div className="flex gap-2 overflow-hidden px-4 py-8 md:px-12">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="aspect-video w-44 flex-none animate-pulse rounded bg-neutral-800 sm:w-56 md:w-64"
          />
        ))}
      </div>
    </section>
  );
}

export function GridSkeleton({ title }: { title: string }) {
  return (
    <section className="px-4 md:px-12">
      <h2 className="mb-6 text-xl font-semibold text-neutral-200 md:text-2xl">
        {title}
      </h2>
      <div className="flex flex-wrap gap-x-2 gap-y-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <div
            key={index}
            className="aspect-video w-44 flex-none animate-pulse rounded bg-neutral-800 sm:w-56 md:w-64"
          />
        ))}
      </div>
    </section>
  );
}
