import { Badge } from '@apex/ui';

import { CaseStatusButton } from './case-status-button';

import type { CaseStatusInput, CaseTypeInput } from '../schemas';

export interface CaseListItem {
  id: string;
  title: string;
  description: string | null;
  type: CaseTypeInput;
  status: CaseStatusInput;
  startedAt: Date;
  endedAt: Date | null;
}

/**
 * The cases of one athlete.
 *
 * A server component: the list is read-only, and only the status control needs
 * the client. Rendering the whole list on the client would ship the athlete's
 * case titles to the browser as JSON for no benefit.
 */
export function CaseList({ athleteId, cases }: { athleteId: string; cases: CaseListItem[] }) {
  if (cases.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-pretty text-muted-foreground">
        Noch kein Betreuungsfall. Er entsteht automatisch mit dem ersten Assessment (§8) — oder Sie
        eröffnen ihn bewusst für eine laufende Betreuung.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {cases.map((performanceCase) => (
        <li
          key={performanceCase.id}
          className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 rounded-md border border-border bg-card px-4 py-3"
        >
          {/* `min-w-0` with `break-words`: a long case title must wrap inside
              the row rather than push the status control off it. */}
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium break-words">{performanceCase.title}</span>
              <StatusBadge status={performanceCase.status} />
              {performanceCase.type === 'SINGLE_ASSESSMENT' ? (
                <Badge variant="outline">Einzelnes Assessment</Badge>
              ) : null}
            </div>

            {performanceCase.description ? (
              <p className="text-sm break-words text-muted-foreground">
                {performanceCase.description}
              </p>
            ) : null}

            <p className="text-xs text-muted-foreground" data-numeric>
              {performanceCase.startedAt.toLocaleDateString('de-DE')}
              {performanceCase.endedAt
                ? ` – ${performanceCase.endedAt.toLocaleDateString('de-DE')}`
                : ' – offen'}
            </p>
          </div>

          <CaseStatusButton
            caseId={performanceCase.id}
            athleteId={athleteId}
            status={performanceCase.status}
          />
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ status }: { status: CaseStatusInput }) {
  if (status === 'OPEN') return <Badge variant="accent">Offen</Badge>;
  if (status === 'CLOSED') return <Badge variant="secondary">Abgeschlossen</Badge>;

  return <Badge variant="outline">Archiviert</Badge>;
}
