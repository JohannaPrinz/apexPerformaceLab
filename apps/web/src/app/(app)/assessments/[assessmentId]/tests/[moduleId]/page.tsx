import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft } from 'lucide-react';

import type { AssessmentModuleStatus } from '@apex/domain';

import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';
import { moduleLabel, TestOverview } from '@/features/assessments';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Test',
};

/**
 * What one test is and holds — where a tile leads.
 *
 * Reads the same `measurements.workspace` the entry screen does. Two screens
 * over one procedure rather than two procedures: what a coach may see about a
 * test does not depend on whether they came to read it or to fill it in.
 */
export default async function TestOverviewPage({
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

  /**
   * The next test still awaiting work.
   *
   * Searched from this test's own position so a session runs forwards, and
   * archived siblings are skipped — a test that was put away is not the next
   * one to do.
   */
  const open = (entry: { status: string; archivedAt: Date | null }) =>
    entry.archivedAt === null && (entry.status === 'PLANNED' || entry.status === 'IN_PROGRESS');
  const here = workspace.siblings.findIndex((entry) => entry.id === moduleId);
  const found =
    workspace.siblings.slice(here + 1).find((entry) => open(entry)) ??
    workspace.siblings.slice(0, Math.max(here, 0)).find((entry) => open(entry));

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <Link
        href={`/assessments/${assessmentId}`}
        className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
      >
        <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{workspace.assessment.question}</span>
      </Link>

      <TestOverview
        moduleId={workspace.moduleId}
        assessmentId={assessmentId}
        moduleKey={workspace.moduleKey}
        moduleName={workspace.moduleName}
        moduleDescription={workspace.moduleDescription}
        status={workspace.status as AssessmentModuleStatus}
        configuration={workspace.configuration}
        types={workspace.types}
        exercises={workspace.exercises}
        measurements={workspace.measurements}
        notes={workspace.notes}
        readiness={workspace.readiness}
        createdAt={workspace.createdAt}
        completedAt={workspace.completedAt}
        reopenedAt={workspace.reopenedAt}
        archivedAt={workspace.archivedAt}
        nextModule={found === undefined ? null : { id: found.id, label: moduleLabel(found) }}
      />
    </main>
  );
}
