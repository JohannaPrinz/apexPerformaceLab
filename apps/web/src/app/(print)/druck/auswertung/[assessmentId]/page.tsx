import { notFound } from 'next/navigation';

import { SharedReport } from '@/features/reports';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Auswertung — Druckansicht',
};

/**
 * The analysis, set for paper.
 *
 * ## Why this page exists
 *
 * It is what the coach previews before handing the analysis over, and it is what
 * either of them saves as a PDF. One page for both: a preview that showed
 * something other than what gets printed would be worth less than no preview.
 *
 * ## Why a draft prints too
 *
 * It used to refuse anything unpublished, on the reasoning that a document
 * nobody published has no frozen version to print. That is true of the *record*
 * and wrong about the *coach*: sharing freezes the analysis for good, and the
 * last chance to read the thing properly — on paper, away from the screen it
 * was written on — falls before it, not after. So a draft prints, and says on every page that
 * it is a draft.
 *
 * The two are never confused. A published document carries the frozen snapshot,
 * word for word what the athlete opens. A draft is composed from the working
 * state at the moment of asking, by the same function publishing uses
 * (`composeSnapshot`) — so what a coach reads here is what publishing would
 * freeze, and nothing is written by looking.
 *
 * ## Why print styling and not a PDF library
 *
 * The browser already has a print engine, it already has this document laid out,
 * and it produces a PDF from it in one step. A library would mean a second
 * layout to keep in step with this one, for a file the browser writes anyway.
 * What the browser needed was a stylesheet that treats a page as a page — see
 * the print block in the design system.
 */
export default async function EvaluationPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ assessmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { assessmentId } = await params;
  const { auswertung } = await searchParams;

  /**
   * Which analysis, where the assessment has several.
   *
   * The screen always says; a link without it is from before an assessment
   * could hold more than one, and still prints the newest shared analysis or,
   * failing that, the newest draft.
   */
  const reportId = typeof auswertung === 'string' ? auswertung : undefined;

  const published =
    reportId === undefined
      ? await api.reports.publishedSnapshot({ assessmentId })
      : await api.reports.snapshot({ reportId });
  const snapshot = published ?? (await api.reports.draftSnapshot({ assessmentId, reportId }));

  // Neither shared nor drawing on a single test: there is no document.
  if (snapshot === null) notFound();

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-10 print:max-w-none print:px-0 print:py-0">
      {published === null ? <DraftMark /> : null}
      <SharedReport snapshot={snapshot} forPrint />
    </main>
  );
}

/**
 * The note an unpublished document carries — **on screen only**.
 *
 * It used to print as well, with a running "ENTWURF" in the corner of every
 * sheet. Both are gone from the page: the corner mark was positioned over the
 * document and landed on top of a chart, and the note itself is a message to
 * the coach standing at the screen, not part of the analysis.
 *
 * The consequence is stated plainly rather than designed around: a printed
 * draft and a printed final document look the same. What tells them apart is
 * the document itself — a published one is the frozen version the athlete has,
 * and it is the only one with a share link behind it.
 */
function DraftMark() {
  return (
    <p className="rounded-md border border-dashed border-border bg-muted px-4 py-3 text-sm text-pretty print:hidden">
      <span className="font-medium">Entwurf.</span> Diese Auswertung ist noch nicht abgeschlossen —
      sie lässt sich weiter ändern, und der Athlet hat sie nicht. Abgeschlossen ist sie erst, wenn
      Sie sie mit dem Athleten teilen.
    </p>
  );
}
