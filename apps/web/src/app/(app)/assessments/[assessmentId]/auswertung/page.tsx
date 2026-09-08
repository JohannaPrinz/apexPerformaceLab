import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft } from 'lucide-react';

import { Badge } from '@apex/ui';

import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';
import { ASSESSMENT_STATUS_LABELS_DE } from '@/features/assessments/components/labels';
import {
  AssessmentEvaluation,
  PublishAndShare,
  SharedReport,
  StartEvaluation,
} from '@/features/reports';
import { emailReady } from '@/integrations/email';
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

  /**
   * Everything that needs only the id in the address bar, at once.
   *
   * Four reads, one wave: none of them looks at another's answer — they all
   * take the same `assessmentId`. They used to run one after the other behind
   * the analysis, which is the slowest read on the screen, so the page waited
   * out four round trips it never had to.
   */
  const [assessment, evaluation, reports, snapshot] = await Promise.all([
    api.assessments.byId({ assessmentId }).catch((error: unknown) => {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
      throw error;
    }),
    // `null` while no analysis exists — the screen then offers to start one.
    api.reports.evaluation({ assessmentId }),
    // Which analyses exist for this assessment, so a published one is shown as
    // a document rather than as a draft that cannot be edited.
    api.reports.listForAssessment({ assessmentId }),
    // What was published, so a finished analysis is still readable here — the
    // coach must be able to see what they sent, not just that they sent it.
    api.reports.publishedSnapshot({ assessmentId }),
  ]);

  const latest = reports[0] ?? null;
  const reportId = evaluation?.reportId ?? latest?.id ?? null;
  const finished = evaluation === null && latest?.status === 'PUBLISHED';

  /**
   * The athlete's record — read once, for two questions.
   *
   * The analysis carries their name; the panel needs their address, which the
   * analysis does not hold. Reading it here lets the panel name the recipient
   * before the coach commits, and refuse with the actual reason where it cannot
   * — no address on file, or no sender configured.
   */
  const [record, shares] = await Promise.all([
    api.athletes.byId({ athleteId: assessment.athleteId }),
    // Who the analysis was released to. Waits, because which analysis that is
    // follows from the draft above — or, where none is open, from the list.
    reportId === null ? [] : api.reports.shares({ reportId }),
  ]);
  const athlete = evaluation?.athlete ?? record;
  const recipient = record.email ?? null;
  const mailReady = emailReady();

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

      {/* The document carries the athlete, the date and the author. What only
          the workspace needs — the state of the examination and which version
          of the analysis this is — sits here, once. */}
      {/* Only where no document follows: the analysis renders its own title,
          and two of them on one screen was part of what made it long. */}
      {evaluation === null ? (
        <h1 className="text-2xl font-semibold text-pretty">
          {athlete.firstName} {athlete.lastName}
        </h1>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant={assessment.status === 'COMPLETED' ? 'accent' : 'secondary'}>
          {ASSESSMENT_STATUS_LABELS_DE[assessment.status] ?? assessment.status}
        </Badge>
        {evaluation === null ? (
          <span data-numeric>{DATE.format(assessment.performedAt)}</span>
        ) : (
          <span data-numeric>Version {evaluation.version}</span>
        )}
      </div>

      {evaluation !== null ? (
        <>
          {/* Already handed to an athlete: the link they hold points at what
              they were given, so it stops being editable here. */}
          <AssessmentEvaluation evaluation={evaluation} locked={shares.length > 0} />

          <PublishAndShare
            assessmentId={assessmentId}
            reportId={evaluation.reportId}
            published={false}
            shares={shares}
            hasIncludedTests={evaluation.summary.included > 0}
            recipient={recipient}
            mailReady={mailReady}
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

          {/* The document itself, exactly as the athlete reads it. Rendering
              only the sharing controls left a coach unable to see what they had
              sent — the one asymmetry this screen must not have. */}
          {snapshot === null ? null : <SharedReport snapshot={snapshot} />}

          <PublishAndShare
            assessmentId={assessmentId}
            reportId={reportId}
            published
            shares={shares}
            hasIncludedTests
            recipient={recipient}
            mailReady={mailReady}
          />
        </>
      ) : (
        <StartEvaluation assessmentId={assessmentId} />
      )}
    </main>
  );
}
