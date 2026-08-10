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
      <p className="text-sm text-muted-foreground">
        No case yet. One is created automatically with the first assessment (§8) — or open one
        deliberately for an ongoing engagement.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {cases.map((performanceCase) => (
        <li
          key={performanceCase.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
        >
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{performanceCase.title}</span>
              <StatusBadge status={performanceCase.status} />
              {performanceCase.type === 'SINGLE_ASSESSMENT' ? (
                <Badge variant="outline">Single assessment</Badge>
              ) : null}
            </div>

            {performanceCase.description ? (
              <p className="text-sm text-muted-foreground">{performanceCase.description}</p>
            ) : null}

            <p className="text-xs text-muted-foreground" data-numeric>
              {performanceCase.startedAt.toLocaleDateString('de-DE')}
              {performanceCase.endedAt
                ? ` – ${performanceCase.endedAt.toLocaleDateString('de-DE')}`
                : ' – open'}
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
  if (status === 'OPEN') return <Badge variant="accent">Open</Badge>;
  if (status === 'CLOSED') return <Badge variant="secondary">Closed</Badge>;

  return <Badge variant="outline">Archived</Badge>;
}
