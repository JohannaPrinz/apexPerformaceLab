import { notFound } from 'next/navigation';

import { SharedReport } from '@/features/reports';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Auswertung — Druckansicht',
};

/**
 * The published analysis, set for paper.
 *
 * ## Why this page exists
 *
 * It is what the coach previews before handing the analysis over, and it is what
 * either of them saves as a PDF. One page for both: a preview that showed
 * something other than what gets printed would be worth less than no preview.
 *
 * ## Why the athlete's own document and not a second rendering
 *
 * `SharedReport` is what the link opens. Printing a separate composition would
 * eventually disagree with it about the same examination — the same reason the
 * coach's screen and the athlete's screen already share one component.
 *
 * ## Why print styling and not a PDF library
 *
 * The browser already has a print engine, it already has this document laid out,
 * and it produces a PDF from it in one step. A library would mean a second
 * layout to keep in step with this one, for a file the browser writes anyway.
 *
 * Only a draft is refused: a document nobody published has no frozen version to
 * print, and printing the draft would put a page in somebody's hands that the
 * record does not contain.
 */
export default async function EvaluationPrintPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  const snapshot = await api.reports.publishedSnapshot({ assessmentId });

  if (snapshot === null) notFound();

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-10 print:max-w-none print:px-0 print:py-0">
      <SharedReport snapshot={snapshot} />
    </main>
  );
}
