import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft } from 'lucide-react';

import type { AssessmentModuleStatus } from '@apex/domain';

import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';
import { TestRunner } from '@/features/assessments';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Test durchführen',
};

/**
 * Performing one test.
 *
 * The whole screen is built from what `measurements.workspace` returns — the
 * configuration, the measurement types, what is recorded and the readiness the
 * domain service computed. Nothing here knows what a lactate test is.
 */
export default async function TestPage({
  params,
}: {
  params: Promise<{ assessmentId: string; moduleId: string }>;
}) {
  const { assessmentId, moduleId } = await params;

  const workspace = await api.assessments.measurements
    .workspace({ moduleId })
    .catch((error: unknown) => {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
      throw error;
    });

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        {/* One step up is the test, not the assessment: the overview is what
            the tile opens and what this screen was reached from. */}
        <Link
          href={`/assessments/${assessmentId}/tests/${moduleId}`}
          className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
        >
          {/* `shrink-0` on the arrow and `min-w-0` on the label: without them
              the link sized itself to the whole question and pushed the page
              sideways. Measured at 375px — the page was 466px wide. */}
          <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 truncate">
            {workspace.moduleName ?? workspace.assessment.question}
          </span>
        </Link>
      </div>

      <TestRunner
        moduleId={workspace.moduleId}
        moduleKey={workspace.moduleKey}
        moduleName={workspace.moduleName ?? null}
        status={workspace.status as AssessmentModuleStatus}
        configuration={workspace.configuration}
        types={workspace.types}
        exercises={workspace.exercises}
        measurements={workspace.measurements}
        notes={workspace.notes}
        readiness={workspace.readiness}
        assessmentId={assessmentId}
        // Constant today, and honestly so. The rule — only the coach who
        // performed a test may change it — is decided and written down
        // (docs/SECURITY.md §3), but the authorization boundary in the MVP is
        // the Workspace (§26.24). This prop is where the answer will be read
        // when the permissions slice supplies one; nothing is stubbed for it in
        // the meantime, because a half-built author check would have to be
        // unpicked.
        canEdit
      />
    </main>
  );
}
