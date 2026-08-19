import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';

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
        <Link
          href={`/assessments/${assessmentId}`}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← {assessment.question}
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
