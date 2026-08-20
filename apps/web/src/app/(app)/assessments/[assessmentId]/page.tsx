import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';

import { assessmentHasBegun } from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';
import { CopyAssessmentButton, CreateTestDialog, ModuleCard } from '@/features/assessments';
import { ASSESSMENT_TYPE_LABELS_DE } from '@/features/assessments/components/labels';
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
  const [siblings, exerciseCatalogue] = await Promise.all([
    api.assessments.listForAthlete({ athleteId: assessment.athleteId }),
    // The ordinary catalogue procedure — this workspace plus system-wide, and
    // never another tenant's. The dialog picks from what it is given; it does
    // not query and does not decide reachability.
    api.exercises.list({ includeArchived: false, limit: 200, offset: 0 }),
  ]);

  const exerciseOptions = exerciseCatalogue.map((exercise) => ({
    id: exercise.id,
    name: exercise.name,
    category: exercise.category,
    scope: exercise.scope,
  }));
  const copyTargets = siblings
    .filter((entry) => entry.id !== assessment.id)
    .map((entry) => ({
      id: entry.id,
      question: entry.question,
      moduleKeys: entry.modules.map((entry_) => entry_.moduleKey),
    }));

  // Whether the examination took place, from its tests alone — there is no
  // status on the assessment itself, and adding one would be a second source of
  // truth for something the tests already say.
  const assessmentBegun = assessmentHasBegun(assessment.modules.map((entry) => entry.status));

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Assessment</span>
          <h1 className="text-2xl font-semibold text-pretty">{assessment.question}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {ASSESSMENT_TYPE_LABELS_DE[assessment.type] ?? assessment.type}
            </Badge>
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
            Jeder Test erfasst die Messgrößen, mit denen er konfiguriert ist. Ein Test mit mehreren
            Stufen — etwa ein Laktatstufentest — erfasst den gesamten Satz einmal je Stufe.
          </p>
        </div>

        {assessment.modules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch kein Test konfiguriert. Ein Assessment braucht mindestens einen (§26.6).
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
                assessmentBegun={assessmentBegun}
              />
            ))}
          </div>
        )}

        {/* The dialog is the ordinary way in; the builder route stays for a
            configuration the dialog deliberately does not carry. */}
        <div className="flex flex-wrap items-center gap-3">
          <CreateTestDialog assessmentId={assessment.id} exercises={exerciseOptions} />

          <Button variant="ghost" className={TOUCH_BUTTON} asChild>
            <Link href={`/assessments/${assessment.id}/tests/new`}>Ausführlich konfigurieren</Link>
          </Button>
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        <Link href="/athletes" className="text-accent underline-offset-4 hover:underline">
          Zurück zu den Athleten
        </Link>
      </p>
    </main>
  );
}
