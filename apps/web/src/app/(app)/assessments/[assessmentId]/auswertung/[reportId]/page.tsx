import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft } from 'lucide-react';

import { Badge } from '@apex/ui';

import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';
import { ASSESSMENT_STATUS_LABELS_DE } from '@/features/assessments/components/labels';
import {
  ArchiveAnalysisButton,
  AssessmentEvaluation,
  DeleteAnalysisButton,
  ShareAnalysis,
  SharedReport,
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

/** A refusal of the procedure as a 404 page, anything else as the error it is. */
const orNotFound = (error: unknown): never => {
  if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
  throw error;
};

/**
 * One analysis of an assessment — its own screen.
 *
 * ## Three states, three screens
 *
 * - **Entwurf:** the working document. Tests go in and out through "Grundlage
 *   ändern", the text is written in place, and the draft can be deleted.
 * - **Geteilt:** the frozen document, exactly as the athlete reads it, with the
 *   links that were handed out. It can be shared again or archived.
 * - **Archiviert:** the same document, read-only, with the links it once had —
 *   all of them withdrawn.
 *
 * The handover panel sits in the same place in all three on purpose. Sharing a
 * draft turns this very page into the shared one, and a panel that moved would
 * be remounted and lose the confirmation of what was just sent.
 */
export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ assessmentId: string; reportId: string }>;
}) {
  const { assessmentId, reportId } = await params;

  const [assessment, analysis, shares] = await Promise.all([
    api.assessments.byId({ assessmentId }).catch(orNotFound),
    api.reports.analysis({ assessmentId, reportId }).catch(orNotFound),
    api.reports.shares({ reportId }),
  ]);

  const draft = analysis.status === 'DRAFT';

  const [evaluation, snapshot, record] = await Promise.all([
    draft ? api.reports.evaluation({ assessmentId, reportId }) : null,
    draft ? null : api.reports.snapshot({ reportId }),
    api.athletes.byId({ athleteId: assessment.athleteId }),
  ]);

  // A draft that the evaluation cannot find has been deleted in the meantime.
  if (draft && evaluation === null) notFound();

  const activeShares = shares.filter((entry) => entry.state === 'ACTIVE').length;

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <Link
        href={`/assessments/${assessmentId}/auswertung`}
        className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
      >
        <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">Alle Auswertungen · {assessment.question}</span>
      </Link>

      {/* The document carries the athlete, the date and the author. What only
          the workspace needs — which version this is, where it stands, and what
          can still be done with it — sits here, once. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {draft ? (
            <Badge variant="secondary">Entwurf</Badge>
          ) : analysis.status === 'PUBLISHED' ? (
            <Badge variant="accent">Geteilt</Badge>
          ) : (
            <Badge variant="outline">Archiviert</Badge>
          )}
          <span data-numeric>Version {analysis.version}</span>
          <span aria-hidden="true">·</span>
          <span>
            Assessment {ASSESSMENT_STATUS_LABELS_DE[assessment.status]?.toLowerCase() ?? ''}
          </span>
        </div>

        {draft ? (
          <DeleteAnalysisButton assessmentId={assessmentId} reportId={reportId} />
        ) : analysis.status === 'PUBLISHED' ? (
          <ArchiveAnalysisButton
            assessmentId={assessmentId}
            reportId={reportId}
            activeShares={activeShares}
          />
        ) : null}
      </div>

      {analysis.status === 'ARCHIVED' ? (
        <p className="max-w-prose rounded-md border border-border bg-muted px-4 py-3 text-sm text-pretty">
          Archiviert
          {analysis.archivedAt === null ? '' : ` am ${DATE.format(analysis.archivedAt)}`}. Der
          Athlet hat keinen Zugriff mehr; die Auswertung bleibt für Sie so lesbar, wie sie geteilt
          wurde.
        </p>
      ) : null}

      {evaluation !== null ? (
        <AssessmentEvaluation evaluation={evaluation} />
      ) : snapshot !== null ? (
        <SharedReport snapshot={snapshot} />
      ) : (
        <p className="text-sm text-muted-foreground">Das Dokument ist nicht lesbar.</p>
      )}

      <ShareAnalysis
        key="handover"
        assessmentId={assessmentId}
        reportId={reportId}
        status={analysis.status}
        shares={shares}
        hasIncludedTests={evaluation === null || evaluation.summary.included > 0}
        recipient={record.email ?? null}
        mailReady={emailReady()}
      />
    </main>
  );
}
