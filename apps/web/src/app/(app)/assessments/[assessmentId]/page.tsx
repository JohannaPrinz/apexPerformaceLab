import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft } from 'lucide-react';

import { assessmentProgress, isAssessmentLive } from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_TARGET } from '@/components/common/touch';
import {
  AssessmentStatusActions,
  CopyAssessmentButton,
  CreateTestDialog,
  EditAssessmentDialog,
  ModuleCard,
} from '@/features/assessments';
import {
  ASSESSMENT_STATUS_LABELS_DE,
  ASSESSMENT_TYPE_LABELS_DE,
} from '@/features/assessments/components/labels';
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

  // A configured test is copied into this assessment — a second run of it — or
  // into another assessment of the same athlete.
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
    .map((entry) => ({ id: entry.id, question: entry.question }));

  /**
   * The working list, and what was put away.
   *
   * An archived test leaves the list and the progress count but never the
   * record — it stays reachable through "Archivierte Tests einblenden". Its
   * measurements are untouched (§13).
   */
  const activeModules = assessment.modules.filter((entry) => entry.archivedAt === null);
  const archivedModules = assessment.modules.filter((entry) => entry.archivedAt !== null);

  const moduleStatuses = activeModules.map((entry) => entry.status);

  /**
   * Whether the examination is closed — finished, abandoned or put away.
   *
   * What decides whether a test may still be removed. Read from the
   * assessment's own status, not from "has any test started": the latter froze
   * every planned test the moment the coach started the session.
   */
  const assessmentClosed = !isAssessmentLive(assessment.status);

  /**
   * How far the examination has got — read from its tests, never stored.
   *
   * A second copy of this number would be one more thing that can disagree with
   * the tests it describes.
   */
  const progress = assessmentProgress(moduleStatuses);

  /**
   * The test the coach would work on next.
   *
   * The first that is neither finished nor deliberately set aside, in the order
   * the tests were added. `null` once every test is decided — the primary
   * action is then "finish", not "continue".
   */
  const nextModule =
    activeModules.find((entry) => entry.status === 'IN_PROGRESS' || entry.status === 'PLANNED') ??
    null;

  /** Adding and configuring tests belongs to a live examination, not a closed one. */
  const live = assessment.status === 'PLANNED' || assessment.status === 'IN_PROGRESS';

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      {/* One step up, not all the way out: the chain is
          Test → Assessment → Betreuungsfall → Athlet, and every screen returns
          to the one that contains it. */}
      <Link
        href={`/athletes/${assessment.athleteId}`}
        className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Zurück zum Athleten
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        {/* `basis-80`: with five actions beside it the question was squeezed
            into a 170px column and broke over six lines at 1280. It now keeps a
            readable width and the actions wrap to their own row instead. */}
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1">
          <span className="eyebrow">Assessment</span>
          <h1 className="text-2xl font-semibold text-pretty">{assessment.question}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {/* Status first: it decides what every other control on this page
                means. Wording, never colour alone. */}
            <Badge variant={assessment.status === 'IN_PROGRESS' ? 'accent' : 'secondary'}>
              {ASSESSMENT_STATUS_LABELS_DE[assessment.status] ?? assessment.status}
            </Badge>
            <Badge variant="outline">
              {ASSESSMENT_TYPE_LABELS_DE[assessment.type] ?? assessment.type}
            </Badge>
            {/* One date, two meanings: while the examination is still planned
                it says when it shall happen, afterwards when it did. A second
                column would eventually disagree with this one. */}
            <span className="text-xs text-muted-foreground">
              {assessment.status === 'PLANNED' ? 'Geplant für ' : 'Durchgeführt am '}
              <span data-numeric>{assessment.performedAt.toLocaleDateString('de-DE')}</span>
            </span>
          </div>

          {assessment.description === null ? null : (
            <p className="max-w-prose text-sm text-pretty text-muted-foreground">
              {assessment.description}
            </p>
          )}

          {progress.total === 0 ? null : (
            <p className="text-sm text-muted-foreground">
              {progress.completed} von {progress.total} {progress.total === 1 ? 'Test' : 'Tests'}{' '}
              abgeschlossen
              {progress.skipped === 0 ? '' : ` · ${String(progress.skipped)} übersprungen`}
              {progress.aborted === 0 ? '' : ` · ${String(progress.aborted)} abgebrochen`}
            </p>
          )}
        </div>

        {/* One wrapping row, not a stacked column. Stacked, the three groups
            rendered as three ragged lines of buttons — measured at 1280, where
            there was room for all of them side by side. */}
        <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
          <EditAssessmentDialog
            assessment={{
              id: assessment.id,
              question: assessment.question,
              description: assessment.description,
              type: assessment.type,
              performedAt: assessment.performedAt,
              status: assessment.status,
            }}
          />

          <CopyAssessmentButton assessmentId={assessment.id} />

          {/* Last, because it carries the primary action for whatever state the
              examination is in. */}
          <AssessmentStatusActions
            assessmentId={assessment.id}
            status={assessment.status}
            progress={progress}
            nextModuleHref={
              nextModule === null
                ? null
                : `/assessments/${assessment.id}/tests/${nextModule.id}/run`
            }
          />
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Tests</h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Jeder Test erfasst die Messgrößen, mit denen er konfiguriert ist. Ein Test mit mehreren
            Stufen — etwa ein Laktatstufentest — erfasst den gesamten Satz einmal je Stufe.
          </p>
        </div>

        {activeModules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {archivedModules.length === 0
              ? 'Noch kein Test konfiguriert. Ein Assessment braucht mindestens einen (§26.6).'
              : 'Alle Tests dieses Assessments sind archiviert.'}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {activeModules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                assessmentId={assessment.id}
                typeNames={assessment.measurementTypeNames}
                exerciseNames={assessment.exerciseNames}
                copyTargets={copyTargets}
                assessmentClosed={assessmentClosed}
              />
            ))}
          </div>
        )}

        {archivedModules.length === 0 ? null : (
          <details className="flex flex-col gap-3">
            {/* Shut by default, and never a filter in the URL: what is archived
                is out of the way, not gone, and opening it is a deliberate
                look rather than a state the page remembers. */}
            <summary
              className={`${TOUCH_TARGET} ${FOCUS_RING} flex w-fit cursor-pointer items-center rounded text-sm text-muted-foreground`}
            >
              {archivedModules.length}{' '}
              {archivedModules.length === 1 ? 'archivierter Test' : 'archivierte Tests'} einblenden
            </summary>

            <div className="flex flex-col gap-3 pt-3">
              {archivedModules.map((module) => (
                <ModuleCard
                  key={module.id}
                  module={module}
                  assessmentId={assessment.id}
                  typeNames={assessment.measurementTypeNames}
                  exerciseNames={assessment.exerciseNames}
                  copyTargets={copyTargets}
                  assessmentClosed={assessmentClosed}
                />
              ))}
            </div>
          </details>
        )}

        {/* The dialog is the ordinary way in; the builder route stays for a
            configuration the dialog deliberately does not carry. */}
        {live ? (
          <div className="flex flex-wrap items-center gap-3">
            <CreateTestDialog assessmentId={assessment.id} exercises={exerciseOptions} />

            <Button variant="ghost" className={TOUCH_BUTTON} asChild>
              <Link href={`/assessments/${assessment.id}/tests/new`}>
                Ausführlich konfigurieren
              </Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-pretty text-muted-foreground">
            Dieses Assessment ist {ASSESSMENT_STATUS_LABELS_DE[assessment.status]?.toLowerCase()}.
            Die erfassten Werte bleiben sichtbar; zum Weiterarbeiten öffnen Sie es wieder.
          </p>
        )}
      </section>
    </main>
  );
}
