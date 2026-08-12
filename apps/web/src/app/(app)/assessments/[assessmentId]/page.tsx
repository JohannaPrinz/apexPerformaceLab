import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';

import { Badge, Button } from '@apex/ui';

import { CopyAssessmentButton, ModuleCard } from '@/features/assessments';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Assessment',
};

/**
 * One assessment and the tests it is configured with.
 *
 * What this page shows is the **plan**: which quantities each test records, how
 * many passes, along which dimensions. The values are Measurements and arrive
 * with the entry screen — keeping the two apart is what makes "reuse this
 * setup" a copy of the configuration and nothing else.
 */
export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;

  const assessment = await api.assessments.byId({ assessmentId }).catch((error: unknown) => {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });

  // A configured test is copied into another assessment of the same athlete —
  // an assessment records each test once, so a copy alongside the original is
  // not something the model permits.
  const siblings = await api.assessments.listForAthlete({ athleteId: assessment.athleteId });
  const copyTargets = siblings
    .filter((entry) => entry.id !== assessment.id)
    .map((entry) => ({
      id: entry.id,
      question: entry.question,
      moduleKeys: entry.modules.map((entry_) => entry_.moduleKey),
    }));

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Assessment</span>
          <h1 className="text-2xl font-semibold text-pretty">{assessment.question}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{assessment.type.replace('_', '-').toLowerCase()}</Badge>
            <span className="text-xs text-muted-foreground" data-numeric>
              {assessment.performedAt.toLocaleDateString('de-DE')}
            </span>
          </div>
        </div>

        <CopyAssessmentButton assessmentId={assessment.id} />
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Tests</h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Each test records the quantities it is configured with. A test with several passes — a
            lactate step test, for instance — records the whole set once per stage.
          </p>
        </div>

        {assessment.modules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No test configured yet. An assessment needs at least one (§26.6).
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {assessment.modules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                assessmentId={assessment.id}
                typeNames={assessment.measurementTypeNames}
                exerciseNames={assessment.exerciseNames}
                copyTargets={copyTargets}
              />
            ))}
          </div>
        )}

        <div>
          <Button variant="accent" size="sm" asChild>
            <Link href={`/assessments/${assessment.id}/tests/new`}>Add a test</Link>
          </Button>
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        <Link href="/athletes" className="text-accent underline-offset-4 hover:underline">
          Back to athletes
        </Link>
      </p>
    </main>
  );
}
