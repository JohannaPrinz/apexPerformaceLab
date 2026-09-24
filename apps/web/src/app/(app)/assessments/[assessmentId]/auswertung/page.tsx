import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft } from 'lucide-react';

import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';
import { AnalysisList, NewAnalysisButton, StartEvaluation } from '@/features/reports';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Auswertungen',
};

/**
 * The analyses of one assessment.
 *
 * ## Why a list rather than the analysis itself
 *
 * An assessment used to have one analysis at a time, and this address showed
 * it. A coach may now keep several — one over every test for the athlete, one
 * over two tests for a physiotherapist — and share each on its own. Each has
 * its own address under this one; this page is where they are found and where
 * a new one is started.
 *
 * ## When an analysis is finished
 *
 * When it has been shared with the athlete, and not before. Until then it is
 * a draft: tests go in and out, the text changes, and it can be deleted. Once
 * shared it is fixed and can only be archived. The groups below follow exactly
 * that line.
 */
export default async function AssessmentAnalysesPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;

  const [assessment, analyses] = await Promise.all([
    api.assessments.byId({ assessmentId }).catch((error: unknown) => {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
      throw error;
    }),
    api.reports.analyses({ assessmentId }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      {/* One step up, as everywhere: the analyses belong to the assessment. */}
      <Link
        href={`/assessments/${assessmentId}`}
        className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
      >
        <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{assessment.question}</span>
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-pretty">Auswertungen</h1>
          <p className="max-w-prose text-sm text-pretty text-muted-foreground">
            Eine Auswertung ist abgeschlossen, sobald sie mit dem Athleten geteilt wurde. Bis dahin
            lassen sich Tests hinzufügen und entfernen, und sie kann gelöscht werden.
          </p>
        </div>

        {analyses.length === 0 ? null : <NewAnalysisButton assessmentId={assessmentId} />}
      </div>

      {analyses.length === 0 ? (
        <StartEvaluation assessmentId={assessmentId} />
      ) : (
        <AnalysisList assessmentId={assessmentId} analyses={analyses} />
      )}
    </main>
  );
}
