import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';

import type { ModuleKey } from '@apex/domain';

import { TestBuilder } from '@/features/assessments';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Configure test',
};

/**
 * Reconfiguring a test that already exists.
 *
 * The same builder as adding one, seeded from the module's **own stored**
 * configuration rather than a template — the link to the template was never
 * kept, and reopening one would silently discard the coach's edits.
 *
 * What may still be changed is decided server-side, against the values actually
 * recorded: removing a quantity that already holds readings, cutting the stages
 * below a recorded one, or switching sides is refused with a sentence naming
 * every obstacle.
 */
export default async function ConfigureTestPage({
  params,
}: {
  params: Promise<{ assessmentId: string; moduleId: string }>;
}) {
  const { assessmentId, moduleId } = await params;

  const [assessment, measurementTypes, exercises] = await Promise.all([
    api.assessments.byId({ assessmentId }).catch((error: unknown) => {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
      throw error;
    }),
    api.assessments.measurementTypes(),
    api.exercises.list({ includeArchived: false }),
  ]);

  const assessmentModule = assessment.modules.find((entry) => entry.id === moduleId);
  if (!assessmentModule) notFound();

  if (!assessmentModule.configuration) {
    return (
      <main className="mx-auto flex w-full max-w-content flex-col gap-4 px-6 py-12">
        <Link
          href={`/assessments/${assessmentId}`}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← {assessment.question}
        </Link>
        <p className="text-sm text-muted-foreground">
          This test was configured under a shape that can no longer be read, so it cannot be edited
          here. Its measurements are unaffected.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        <Link
          href={`/assessments/${assessmentId}`}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← {assessment.question}
        </Link>
        <h1 className="text-2xl font-semibold">Configure test</h1>
      </div>

      <TestBuilder
        assessmentId={assessmentId}
        measurementTypes={measurementTypes}
        exercises={exercises.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          ownedByWorkspace: exercise.scope === 'WORKSPACE',
        }))}
        existing={{
          moduleId: assessmentModule.id,
          moduleKey: assessmentModule.moduleKey as ModuleKey,
          configuration: assessmentModule.configuration,
        }}
      />
    </main>
  );
}
