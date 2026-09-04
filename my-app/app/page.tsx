import { Suspense } from "react";
import Hero from "@/components/Hero";
import Row from "@/components/Row";
import SetupNotice from "@/components/SetupNotice";
import { HeroSkeleton, RowSkeleton } from "@/components/Skeletons";
import { HOME_ROWS, hasTmdbToken } from "@/lib/tmdb";

export default function Home() {
  if (!hasTmdbToken()) return <SetupNotice />;

  return (
    <div>
      <Suspense fallback={<HeroSkeleton />}>
        <Hero />
      </Suspense>

      {/* Rows ride up over the hero's lower gradient, as on Netflix. */}
      <div className="relative z-20 -mt-24 space-y-2 md:-mt-32">
        {HOME_ROWS.map((row) => (
          <Suspense key={row.id} fallback={<RowSkeleton title={row.title} />}>
            <Row row={row} />
          </Suspense>
        ))}
      </div>
    </div>
  );
}
