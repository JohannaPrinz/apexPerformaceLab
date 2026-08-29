import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft } from 'lucide-react';

import { Badge } from '@apex/ui';

import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';
import { ASSESSMENT_STATUS_LABELS_DE } from '@/features/assessments/components/labels';
import { AssessmentEvaluation, PublishAndShare, StartEvaluation } from '@/features/reports';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Auswertung',
};

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * The analysis of one assessment — its own screen, not a disclosure.
 *
 * ## Why it is a page
 *
 * It has a version, it will have a published state, and it will have a link that
 * is handed to an athlete. What earns a URL does not belong folded away at the
 * bottom of another screen, and the shape it had there — seven statements of the
 * fill state, a selection that disagreed with the text below it — was a symptom
 * of exactly that.
 *
 * ## Why it does not require a finished assessment
 *
 * An interim analysis over a partly recorded examination is a normal thing to
 * write, and whether it is worth writing is the coach's judgement. The screen
 * says how much was recorded and leaves the decision alone.
 */
export default async function AssessmentEvaluationPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;

  const [assessment, evaluation] = await Promise.all([
    api.assessments.byId({ assessmentId }).catch((error: unknown) => {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
      throw error;
    }),
    // `null` while no analysis exists — the screen then offers to start one.
    api.reports.evaluation({ assessmentId }),
  ]);

  // Which analyses exist for this assessment, so a published one is shown as a
  // document rather than as a draft that cannot be edited.
  const reports = await api.reports.listForAssessment({ assessmentId });
  const latest = reports[0] ?? null;
  const reportId = evaluation?.reportId ?? latest?.id ?? null;
  const shares = reportId === null ? [] : await api.reports.shares({ reportId });
  const finished = evaluation === null && latest?.status === 'PUBLISHED';

  const athlete =
    evaluation?.athlete ?? (await api.athletes.byId({ athleteId: assessment.athleteId }));

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      {/* One step up, as everywhere: the analysis belongs to the assessment. */}
      <Link
        href={`/assessments/${assessmentId}`}
        className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
      >
        <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{assessment.question}</span>
      </Link>

      <header className="flex flex-col gap-2">
        <span className="eyebrow">Auswertung</span>
        <h1 className="text-2xl font-semibold text-pretty">
          {athlete.firstName} {athlete.lastName}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant={assessment.status === 'COMPLETED' ? 'accent' : 'secondary'}>
            {ASSESSMENT_STATUS_LABELS_DE[assessment.status] ?? assessment.status}
          </Badge>
          <span data-numeric>{DATE.format(assessment.performedAt)}</span>
          {evaluation === null ? null : <span data-numeric>· Version {evaluation.version}</span>}
        </div>
      </header>

      {evaluation !== null ? (
        <>
          <AssessmentEvaluation evaluation={evaluation} />

          <PublishAndShare
            assessmentId={assessmentId}
            reportId={evaluation.reportId}
            published={false}
            shares={shares}
            hasIncludedTests={evaluation.summary.included > 0}
          />
        </>
      ) : finished && reportId !== null ? (
        <>
          {/* Abgeschlossen: der Inhalt steht fest (§16). Was hier bleibt, ist
              die Frage des Zugriffs — und die ist eine eigene Entscheidung. */}
          <p className="max-w-prose rounded-md border border-border bg-muted px-4 py-3 text-sm text-pretty">
            Diese Auswertung ist abgeschlossen und lässt sich nicht mehr bearbeiten. Eine spätere
            Änderung wäre eine neue Version.
          </p>

          <PublishAndShare
            assessmentId={assessmentId}
            reportId={reportId}
            published
            shares={shares}
            hasIncludedTests
          />
        </>
      ) : (
        <StartEvaluation assessmentId={assessmentId} />
      )}
    </main>
  );
}
