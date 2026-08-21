import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft } from 'lucide-react';

import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';
import { TestBuilder } from '@/features/assessments';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Test hinzufügen',
};

/**
 * Configuring a new test for an assessment.
 *
 * The catalogues are loaded here, on the server, and handed to the builder. The
 * builder never queries: it assembles a configuration from what it was given,
 * and the procedure verifies every id against this workspace before writing.
 */
export default async function NewTestPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;

  const [assessment, measurementTypes, exercises] = await Promise.all([
    api.assessments.byId({ assessmentId }).catch((error: unknown) => {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
      throw error;
    }),
    api.assessments.measurementTypes(),
    api.exercises.list({ includeArchived: false }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        {/* The same shape as every other back link: a real touch target, and
            allowed to shrink rather than widening the page. Measured at 375px
            it was 32px tall and unbounded. */}
        <Link
          href={`/assessments/${assessmentId}`}
          className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
        >
          <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{assessment.question}</span>
        </Link>
        <h1 className="text-2xl font-semibold">Test hinzufügen</h1>
      </div>

      <TestBuilder
        assessmentId={assessmentId}
        measurementTypes={measurementTypes}
        exercises={exercises.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          ownedByWorkspace: exercise.scope === 'WORKSPACE',
        }))}
        takenModuleKeys={assessment.modules.map((entry) => entry.moduleKey)}
      />
    </main>
  );
}
