import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft } from 'lucide-react';

import { hasMovementProfile } from '@apex/domain';

import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';
import { moduleLabel } from '@/features/assessments';
import { VideoAnalysis } from '@/features/movement';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Videoanalyse',
};

/**
 * Analysing a recorded movement, inside the test it belongs to.
 *
 * ## Why it lives under the test rather than beside the app
 *
 * A repetition count means nothing on its own; it means something as a value of
 * *this* test, of *this* assessment, for *this* athlete. Hanging the analysis off
 * the test route is what makes the results land in the existing record instead of
 * in a tool that happens to share a login — and it is what makes the tenant
 * boundary the same one every other screen uses.
 *
 * Reads the same `measurements.workspace` the overview and the entry screen do.
 * Three screens over one procedure: what a coach may see about a test does not
 * depend on why they opened it.
 */
export default async function VideoAnalysisPage({
  params,
}: {
  params: Promise<{ assessmentId: string; moduleId: string }>;
}) {
  const { assessmentId, moduleId } = await params;

  const workspace = await api.assessments.measurements
    .workspace({ moduleId })
    .catch((error: unknown) => {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
      throw error;
    });

  const title = moduleLabel({ name: workspace.moduleName, moduleKey: workspace.moduleKey });

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <Link
        href={`/assessments/${assessmentId}/tests/${moduleId}`}
        className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
      >
        <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{title}</span>
      </Link>

      <header className="flex flex-col gap-2">
        <span className="eyebrow">Kniebeuge</span>
        <h1 className="text-2xl font-semibold text-pretty">Videoanalyse</h1>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          Ein Video der Kniebeuge auswählen und auswerten. Erfasst werden Wiederholungen,
          Gelenkwinkel, Bewegungsumfang und Dauer — ohne Bewertung der Technik.
        </p>
      </header>

      <VideoAnalysis
        target={{
          kind: 'module',
          moduleId: workspace.moduleId,
          assessmentId,
          configuration: workspace.configuration,
          types: workspace.types,
          // Only the movements that can actually be analysed: offering one with
          // no profile would let a coach start an analysis that measures
          // nothing.
          exercises: Object.entries(workspace.exercises)
            .filter(([, exercise]) => hasMovementProfile(exercise.key))
            .map(([id, exercise]) => ({ id, key: exercise.key, name: exercise.name })),
        }}
      />
    </main>
  );
}
