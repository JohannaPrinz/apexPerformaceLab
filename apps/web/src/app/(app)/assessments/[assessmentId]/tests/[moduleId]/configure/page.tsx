import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft } from 'lucide-react';

import type { ModuleKey } from '@apex/domain';

import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';
import { TestBuilder } from '@/features/assessments';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Test konfigurieren',
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
        {/* The same shape as every other back link: a real touch target, and
            allowed to shrink instead of widening the page. */}
        <Link
          href={`/assessments/${assessmentId}/tests/${moduleId}`}
          className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
        >
          <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{assessmentModule.name ?? assessment.question}</span>
        </Link>
        <p className="text-sm text-muted-foreground">
          Dieser Test wurde mit einer Struktur konfiguriert, die nicht mehr gelesen werden kann, und
          lässt sich hier nicht bearbeiten. Die erfassten Messwerte sind davon nicht betroffen.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        {/* The same shape as every other back link: a real touch target, and
            allowed to shrink instead of widening the page. */}
        <Link
          href={`/assessments/${assessmentId}/tests/${moduleId}`}
          className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
        >
          <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{assessmentModule.name ?? assessment.question}</span>
        </Link>
        <h1 className="text-2xl font-semibold">Test konfigurieren</h1>
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
