import Link from 'next/link';

import { ArrowRight } from 'lucide-react';

import { Badge } from '@apex/ui';

import { FOCUS_RING } from '@/components/common/touch';
import { CreateAssessmentDialog } from '@/features/assessments';
import { ASSESSMENT_TYPE_LABELS_DE } from '@/features/assessments/components/labels';

import { CaseStatusButton } from './case-status-button';

import type { CaseListItem } from './case-list';

/**
 * One engagement, with the assessments that belong to it.
 *
 * ## Why this replaced two sibling lists
 *
 * The athlete page used to show "Betreuungsfälle" and "Assessments" side by
 * side, as if they were two kinds of thing a coach keeps. They are not: §3 says
 * `Athlete → Performance Case → Assessment`, and an assessment always sits
 * inside exactly one case. Two flat lists made that invisible and left the case
 * looking like a container nobody asked for.
 *
 * Nesting them says what the model already says. It also gives "Assessment
 * anlegen" a place where the case is unambiguous — the dialog does not have to
 * ask which one, because the button is inside it.
 */
export interface CaseAssessment {
  readonly id: string;
  readonly question: string;
  readonly type: string;
  readonly performedAt: Date;
  readonly testCount: number;
}

export function CaseSection({
  performanceCase,
  assessments,
  athleteId,
}: {
  readonly performanceCase: CaseListItem;
  readonly assessments: readonly CaseAssessment[];
  readonly athleteId: string;
}) {
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium break-words">{performanceCase.title}</h3>
            <StatusBadge status={performanceCase.status} />
            {performanceCase.type === 'SINGLE_ASSESSMENT' ? (
              <Badge variant="outline">Einzelnes Assessment</Badge>
            ) : null}
          </div>

          {performanceCase.description === null ? null : (
            <p className="text-sm break-words text-muted-foreground">
              {performanceCase.description}
            </p>
          )}

          <p className="text-xs text-muted-foreground" data-numeric>
            {performanceCase.startedAt.toLocaleDateString('de-DE')}
            {performanceCase.endedAt === null
              ? ' – offen'
              : ` – ${performanceCase.endedAt.toLocaleDateString('de-DE')}`}
          </p>
        </div>

        <CaseStatusButton
          caseId={performanceCase.id}
          athleteId={athleteId}
          status={performanceCase.status}
        />
      </header>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h4 className="text-xs tracking-wide text-muted-foreground uppercase">Assessments</h4>

        {assessments.length === 0 ? (
          <p className="text-sm text-pretty text-muted-foreground">
            Noch kein Assessment in diesem Betreuungsfall.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {assessments.map((assessment) => (
              <li key={assessment.id}>
                <Link
                  href={`/assessments/${assessment.id}`}
                  className={`${FOCUS_RING} flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-border px-3 py-2.5 transition-colors hover:border-border-strong`}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium break-words">{assessment.question}</span>
                    <span className="text-xs text-muted-foreground">
                      <span data-numeric>{assessment.performedAt.toLocaleDateString('de-DE')}</span>
                      {' · '}
                      {assessment.testCount} {assessment.testCount === 1 ? 'Test' : 'Tests'}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">
                      {ASSESSMENT_TYPE_LABELS_DE[assessment.type] ?? assessment.type}
                    </Badge>
                    <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* The case is fixed by where the button sits, so the dialog never has
            to ask which one. */}
        <CreateAssessmentDialog
          athleteId={athleteId}
          caseId={performanceCase.id}
          caseTitle={performanceCase.title}
        />
      </div>
    </article>
  );
}

/** The engagement's state, as a word rather than only a colour. */
function StatusBadge({ status }: { readonly status: CaseListItem['status'] }) {
  if (status === 'OPEN') return <Badge variant="accent">Offen</Badge>;
  if (status === 'CLOSED') return <Badge variant="secondary">Abgeschlossen</Badge>;

  return <Badge variant="outline">Archiviert</Badge>;
}

/**
 * What an athlete without any engagement sees.
 *
 * Not an empty list: a coach meeting this screen for the first time needs to
 * know what a case is *for* before being asked to create one, and the shortest
 * true answer is that it is the bracket around a set of assessments.
 */
export function NoCases({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-4 py-12 text-center">
      <div className="flex max-w-md flex-col gap-1.5">
        <p className="font-medium">Noch kein Betreuungsfall angelegt.</p>
        <p className="text-sm text-pretty text-muted-foreground">
          Ein Betreuungsfall bündelt die Assessments, die zu einer Fragestellung gehören — etwa eine
          Wettkampfvorbereitung oder eine Rückkehr nach einer Verletzung. Er ist der Rahmen, in dem
          Sie messen und auswerten.
        </p>
      </div>

      {children}
    </div>
  );
}
