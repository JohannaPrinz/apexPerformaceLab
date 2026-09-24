import Link from 'next/link';

import { ArrowRight } from 'lucide-react';

import { Badge } from '@apex/ui';

import { FOCUS_RING } from '@/components/common/touch';

/**
 * The analyses of one assessment, grouped by where they stand.
 *
 * ## Three groups, because three different things can be done
 *
 * A draft is still being written — tests go in and out, and it can be deleted.
 * A shared analysis is finished: the athlete has it, and it can only be shared
 * again or archived. An archived one is history, folded away. Showing them in
 * one undifferentiated list would put "still open" and "handed over" side by
 * side with nothing but a small badge to tell them apart.
 */

export interface AnalysisListItem {
  readonly id: string;
  readonly title: string;
  readonly status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  readonly version: number;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly testCount: number;
  readonly activeShares: number;
}

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const tests = (count: number) => (count === 1 ? '1 Test' : `${String(count)} Tests`);

export function AnalysisList({
  assessmentId,
  analyses,
}: {
  readonly assessmentId: string;
  readonly analyses: readonly AnalysisListItem[];
}) {
  const drafts = analyses.filter((entry) => entry.status === 'DRAFT');
  const shared = analyses.filter((entry) => entry.status === 'PUBLISHED');
  const archived = analyses.filter((entry) => entry.status === 'ARCHIVED');

  const card = (entry: AnalysisListItem) => (
    <li key={entry.id}>
      <Link
        href={`/assessments/${assessmentId}/auswertung/${entry.id}`}
        className={`${FOCUS_RING} flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-4 hover:border-border-strong`}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {entry.title} · Version {entry.version}
            </span>
            {entry.status === 'DRAFT' ? (
              <Badge variant="secondary">Entwurf</Badge>
            ) : entry.status === 'PUBLISHED' ? (
              <Badge variant="accent">Geteilt</Badge>
            ) : (
              <Badge variant="outline">Archiviert</Badge>
            )}
          </span>
          <span className="text-xs text-muted-foreground" data-numeric>
            {entry.status === 'DRAFT'
              ? `Angelegt am ${DATE.format(entry.createdAt)} · ${tests(entry.testCount)}`
              : entry.status === 'PUBLISHED'
                ? `Geteilt am ${entry.publishedAt === null ? '—' : DATE.format(entry.publishedAt)} · ${tests(entry.testCount)} · ${
                    entry.activeShares === 1
                      ? '1 aktiver Link'
                      : `${String(entry.activeShares)} aktive Links`
                  }`
                : `Archiviert am ${entry.archivedAt === null ? '—' : DATE.format(entry.archivedAt)} · ${tests(entry.testCount)}`}
          </span>
        </span>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );

  return (
    <div className="flex flex-col gap-8">
      {drafts.length === 0 ? null : (
        <section aria-labelledby="analyses-drafts" className="flex flex-col gap-3">
          <h2 id="analyses-drafts" className="text-sm font-medium">
            In Bearbeitung
          </h2>
          <ul className="flex flex-col gap-2">{drafts.map(card)}</ul>
        </section>
      )}

      {shared.length === 0 ? null : (
        <section aria-labelledby="analyses-shared" className="flex flex-col gap-3">
          <h2 id="analyses-shared" className="text-sm font-medium">
            Geteilt
          </h2>
          <ul className="flex flex-col gap-2">{shared.map(card)}</ul>
        </section>
      )}

      {archived.length === 0 ? null : (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            {archived.length === 1
              ? '1 archivierte Auswertung'
              : `${String(archived.length)} archivierte Auswertungen`}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">{archived.map(card)}</ul>
        </details>
      )}
    </div>
  );
}
