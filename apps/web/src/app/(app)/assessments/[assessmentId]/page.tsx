import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { assessmentProgress, isAssessmentLive } from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { ActionMenu } from '@/components/common/action-menu';
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

  /**
   * Everything that needs only the id in the address bar, at once.
   *
   * These three used to run in two waves: the assessment first, then the rest
   * once it had arrived. Nothing in the other two depends on it — they take the
   * same `assessmentId` — so the page waited out one full read for no reason.
   * Measured at 258 ms for the assessment and 235 ms for the analysis overview,
   * one after the other; run together they cost the longer of the two.
   *
   * `Promise.all` also keeps the rejection handling honest: a missing
   * assessment rejects here exactly as it did before, and the sibling reads are
   * settled by `Promise.all` itself rather than left dangling.
   */
  const [assessment, analysis, reports] = await Promise.all([
    api.assessments.byId({ assessmentId }),
    // Only the counts the link needs. The analysis itself has its own screen
    // now, and reading it here would load a page nobody is looking at.
    api.reports.assessmentOverview({ assessmentId }),
    // Whether one was already published: a finished analysis must not read as
    // an invitation to start a second one.
    api.reports.listForAssessment({ assessmentId }),
  ]).catch((error: unknown) => {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });

  /**
   * The name for the way back.
   *
   * The one read that genuinely has to wait: which athlete this is, is only
   * known once the assessment has arrived. An existing procedure rather than
   * widening the assessment payload — this is presentation, not part of what an
   * assessment is.
   *
   * The exercise catalogue, the quantity catalogue, this workspace's saved
   * templates and the athlete's other examinations used to be read here as
   * well. All four exist for things that are shut when the page opens, and are
   * fetched by the dialog and the menu now — through the same procedures and
   * therefore the same doors.
   */
  const athlete = await api.athletes.byId({ athleteId: assessment.athleteId });

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

  // §16: a published analysis is the finished document, not a draft in progress.
  const published = reports.find((entry) => entry.status === 'PUBLISHED');

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      {/* One step up, not all the way out: the chain is
          Test → Assessment → Betreuungsfall → Athlet, and every screen returns
          to the one that contains it. */}
      <Link
        href={`/athletes/${assessment.athleteId}`}
        className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
      >
        <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
        {/* Named, not "Zurück zum Athleten": the chain Athlet → Fall →
            Assessment → Test is only legible if each step says which one it
            returns to — the test screen already names its assessment here. */}
        <span className="min-w-0 truncate">
          {athlete.firstName} {athlete.lastName}
        </span>
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
        {/* The one action that moves the examination forward, and a menu for
            the rest. Three groups of buttons in a row read as a toolbar; what a
            coach opens this screen to do is start, continue or finish it. */}
        <div className="flex items-center justify-end gap-2">
          <AssessmentStatusActions
            part="primary"
            assessmentId={assessment.id}
            status={assessment.status}
            progress={progress}
            nextModuleHref={
              nextModule === null
                ? null
                : `/assessments/${assessment.id}/tests/${nextModule.id}/run`
            }
          />

          <ActionMenu label={`Aktionen: ${assessment.question}`}>
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

            <AssessmentStatusActions
              part="menu"
              assessmentId={assessment.id}
              status={assessment.status}
              progress={progress}
              nextModuleHref={null}
            />
          </ActionMenu>
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-xl font-semibold">Tests</h2>
            <p className="text-sm text-pretty text-muted-foreground">
              Jeder Test erfasst die Messgrößen, mit denen er konfiguriert ist. Ein Test mit
              mehreren Stufen — etwa ein Laktatstufentest — erfasst den gesamten Satz einmal je
              Stufe.
            </p>
          </div>

          {/* Above the list and on the right: adding a test is what a coach
              does *to* this section, so it belongs at its head rather than
              after everything it produces. */}
          {live ? (
            /* Wrapping, not `shrink-0`: at 375 px the two German labels
               measure 376 px side by side and pushed the whole page sideways.
               They take a line of their own instead. */
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              <CreateTestDialog assessmentId={assessment.id} />

              <Button variant="outline" className={TOUCH_BUTTON} asChild>
                <Link href={`/assessments/${assessment.id}/tests/new`}>
                  Ausführlich konfigurieren
                </Link>
              </Button>
            </div>
          ) : null}
        </div>

        {activeModules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {archivedModules.length === 0
              ? 'Noch kein Test konfiguriert. Ein Assessment braucht mindestens einen (§26.6).'
              : 'Alle Tests dieses Assessments sind archiviert.'}
          </p>
        ) : (
          /* Two across from `lg`. Measured at 1280 a card was 992px wide and
             114px tall — most of it empty — while three tests pushed the
             evaluation below the fold. Not three across: the four German
             actions on a card wrap badly under ~450px. */
          <div className="grid gap-3 lg:grid-cols-2">
            {activeModules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                assessmentId={assessment.id}
                typeNames={assessment.measurementTypeNames}
                exerciseNames={assessment.exerciseNames}
                athleteId={assessment.athleteId}
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

            <div className="grid gap-3 pt-3 lg:grid-cols-2">
              {archivedModules.map((module) => (
                <ModuleCard
                  key={module.id}
                  module={module}
                  assessmentId={assessment.id}
                  typeNames={assessment.measurementTypeNames}
                  exerciseNames={assessment.exerciseNames}
                  athleteId={assessment.athleteId}
                  assessmentClosed={assessmentClosed}
                />
              ))}
            </div>
          </details>
        )}

        {/* The dialog is the ordinary way in; the builder route stays for a
            configuration the dialog deliberately does not carry. */}
        {live ? null : (
          <p className="text-sm text-pretty text-muted-foreground">
            Dieses Assessment ist {ASSESSMENT_STATUS_LABELS_DE[assessment.status]?.toLowerCase()}.
            Die erfassten Werte bleiben sichtbar; zum Weiterarbeiten öffnen Sie es wieder.
          </p>
        )}
      </section>

      {/* After the tests, because it is the step after them — and a link
          rather than a disclosure: the analysis has a version, will have a
          published state and a link handed to an athlete, and what earns a URL
          does not belong folded away at the bottom of another screen. */}
      <section aria-labelledby="analysis" className="flex flex-col gap-3">
        <h2 id="analysis" className="text-xl font-semibold">
          Auswertung
        </h2>

        <Link
          href={`/assessments/${assessment.id}/auswertung`}
          className={`${FOCUS_RING} flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4 hover:border-border-strong`}
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">
              {published === undefined && analysis.draft === null
                ? 'Auswertung anlegen'
                : 'Auswertung öffnen'}
            </span>
            <span className="text-xs text-muted-foreground" data-numeric>
              {published === undefined
                ? analysis.draft === null
                  ? `${String(analysis.modules.filter((entry) => entry.selectable).length)} auswertbare Tests`
                  : `Entwurf · Version ${String(analysis.draft.version)} · ${String(analysis.includedCount)} Tests einbezogen`
                : `Abgeschlossen · Version ${String(published.version)}`}
            </span>
          </span>

          <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      </section>
    </main>
  );
}
