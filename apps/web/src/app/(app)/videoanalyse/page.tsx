import { VideoAnalysis } from '@/features/movement';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Videoanalyse',
};

/**
 * Video analysis on its own, before any athlete is chosen.
 *
 * ## Why this is a place of its own
 *
 * A coach films first and files afterwards. Requiring an athlete, a case, an
 * assessment and a test before a video can be looked at makes the quick
 * question — "what does this actually look like" — cost four decisions, and the
 * quick question is the one this screen is for.
 *
 * The domain permits it: §18 puts Documents and Videos on a context ladder
 * where the **athlete is the only required level**, and case, assessment and
 * module are optional. Filing happens after the analysis, and only then does
 * the server find or open the test the values belong in.
 *
 * ## Why the athlete list is loaded here
 *
 * A Server Component asks once, scoped by the session's workspace. Letting the
 * browser fetch it would put a tenant-scoped list behind a client request for
 * no gain — the picker needs it before it can render anything useful.
 */
export default async function StandaloneVideoAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ athlete?: string }>;
}) {
  const { athlete } = await searchParams;

  // 100 is the cap `paginationInputSchema` enforces, so it is the honest
  // maximum rather than a number chosen here. A workspace with more athletes
  // than this needs a search field in the picker, not a longer list — the
  // select would already be unusable well before that point.
  const [athletes, exercises] = await Promise.all([
    api.athletes.list({ limit: 100 }),
    // Asked for by key rather than filtered out of a page of the catalogue:
    // the list is ordered by name and runs to hundreds of entries, so any page
    // of it would miss the handful that have a profile.
    api.exercises.analysable(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Kniebeuge</span>
        <h1 className="text-2xl font-semibold text-pretty">Videoanalyse</h1>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          Ein Video auswerten und die Ergebnisse anschließend einem Athleten zuordnen. Erfasst
          werden Wiederholungen, Gelenkwinkel, Bewegungsumfang und Dauer — ohne Bewertung der
          Technik.
        </p>
      </header>

      <VideoAnalysis
        target={{
          kind: 'standalone',
          suggestedAthleteId: athlete,
          athletes: athletes.items.map((entry) => ({
            id: entry.id,
            name: `${entry.lastName}, ${entry.firstName}`,
          })),
          exercises: exercises.map((entry) => ({
            id: entry.id,
            key: entry.key,
            name: entry.name,
          })),
        }}
      />
    </main>
  );
}
