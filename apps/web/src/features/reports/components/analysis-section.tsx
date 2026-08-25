'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Badge, Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_TARGET } from '@/components/common/touch';
import {
  MODULE_LABELS_DE,
  MODULE_STATUS_LABELS_DE,
  READINESS_LABELS_DE,
} from '@/features/assessments/components/labels';

import { createAnalysisAction, setAnalysisModuleAction } from '../server/actions';

import { DraftEditor, type DraftView } from './draft-editor';

/**
 * What an analysis of this assessment would draw on.
 *
 * ## Three groups, all of them visible
 *
 * A test with results may be chosen. A test with none is shown and cannot be —
 * there is nothing to analyse, and hiding it would leave a coach hunting for a
 * test they know exists. An archived test is behind a disclosure of its own: it
 * has left the working view, and an analysis is not the place it comes back
 * without being asked for.
 *
 * ## Choosing never changes the test
 *
 * A checkbox writes one `ReportModule` row and nothing else. The test's status,
 * its measurements and every other analysis are untouched — structurally, by
 * the shape of the table, not by a rule anybody has to remember.
 *
 * ## An interim analysis is a normal thing
 *
 * Where tests are still open, the section says so as a fact and offers the
 * analysis anyway. Whether it is worth writing over a partly recorded
 * examination is the coach's judgement; blocking it would be the screen making
 * that call instead.
 */

export interface AnalysisModuleRow {
  readonly moduleId: string;
  readonly name: string | null;
  readonly moduleKey: string;
  readonly status: string;
  readonly archived: boolean;
  readonly recorded: number;
  readonly expected: number;
  readonly level: string;
  readonly selectable: boolean;
  readonly included: boolean;
}

export interface AnalysisOverview {
  readonly draft: {
    readonly id: string;
    readonly title: string;
    readonly version: number;
    readonly createdAt: Date;
  } | null;
  readonly modules: readonly AnalysisModuleRow[];
  readonly includedCount: number;
  readonly availableCount: number;
  readonly withoutResultsCount: number;
}

const label = (row: AnalysisModuleRow): string => {
  const name = row.name?.trim() ?? '';

  return name !== ''
    ? name
    : (MODULE_LABELS_DE[row.moduleKey as keyof typeof MODULE_LABELS_DE] ?? row.moduleKey);
};

export function AnalysisSection({
  assessmentId,
  overview,
  draft,
  /** Read-only where the coach may look but not write. */
  readOnly = false,
}: {
  assessmentId: string;
  overview: AnalysisOverview;
  /** The editable text of the current analysis. `null` while there is none. */
  draft: DraftView | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const working = overview.modules.filter((row) => !row.archived);
  const archived = overview.modules.filter((row) => row.archived);
  const withResults = working.filter((row) => row.selectable);
  const open = working.filter((row) => row.recorded === 0);

  function toggle(moduleId: string, included: boolean) {
    const draft = overview.draft;
    if (!draft) return;

    setError(null);
    startTransition(async () => {
      const result = await setAnalysisModuleAction(assessmentId, draft.id, moduleId, included);
      if (result.message) setError(result.message);
      else router.refresh();
    });
  }

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createAnalysisAction(assessmentId, 'Auswertung');
      if (result.message) setError(result.message);
      else router.refresh();
    });
  }

  return (
    <section aria-labelledby="analysis" className="flex flex-col gap-4">
      {/* Shut by default: the tests are what this page is about, and the
          analysis is the step after them. */}
      <details className="rounded-md border border-border bg-card">
        <summary
          className={`${TOUCH_TARGET} ${FOCUS_RING} flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-4 py-3`}
        >
          <h2 id="analysis" className="text-base font-medium">
            Auswertung
          </h2>

          {overview.draft === null ? (
            <Badge variant="outline">Noch keine Auswertung</Badge>
          ) : (
            <Badge variant="secondary">Entwurf · Version {overview.draft.version}</Badge>
          )}

          <span className="text-xs text-muted-foreground" data-numeric>
            {withResults.length} von {working.length} Tests mit Ergebnissen
          </span>
        </summary>

        <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">Grundlage</h3>
            <p className="text-xs text-muted-foreground">
              {overview.draft === null
                ? 'Welche Tests eine Auswertung heranziehen könnte. Die Auswahl lässt sich treffen, sobald ein Entwurf angelegt ist.'
                : 'Welche Tests dieser Entwurf heranzieht. Die Auswahl gehört zur Auswertung — der Test selbst bleibt unverändert.'}
            </p>
          </div>

          {working.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              Dieses Assessment enthält noch keinen Test.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {working.map((row) => (
                <ModuleRow
                  key={row.moduleId}
                  row={row}
                  disabled={readOnly || pending || overview.draft === null}
                  onToggle={toggle}
                />
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground" data-numeric>
            {overview.includedCount} von {withResults.length} auswertbaren Tests einbezogen
            {overview.withoutResultsCount > 0
              ? ` · ${String(overview.withoutResultsCount)} ${
                  overview.withoutResultsCount === 1
                    ? 'Test ohne Ergebnisse'
                    : 'Tests ohne Ergebnisse'
                }`
              : ''}
          </p>

          {open.length === 0 ? null : (
            /* A statement, not a warning: whether an analysis over a partly
               recorded examination is worth writing is the coach's call. */
            <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
              {open.length === 1
                ? 'Ein Test ist noch offen.'
                : `${String(open.length)} Tests sind noch offen.`}{' '}
              Eine Zwischenauswertung über die bereits erfassten Tests ist möglich.
            </p>
          )}

          {archived.length === 0 ? null : (
            <details className="flex flex-col gap-2">
              <summary
                className={`${TOUCH_TARGET} ${FOCUS_RING} flex w-fit cursor-pointer items-center rounded text-xs text-muted-foreground`}
              >
                {archived.length}{' '}
                {archived.length === 1 ? 'archivierter Test' : 'archivierte Tests'} einblenden
              </summary>

              <ul className="flex flex-col gap-2 pt-2">
                {archived.map((row) => (
                  <ModuleRow key={row.moduleId} row={row} disabled onToggle={toggle} />
                ))}
              </ul>
            </details>
          )}

          {draft === null ? null : <DraftEditor draft={draft} readOnly={readOnly} />}

          {error === null ? null : (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          {overview.draft === null && !readOnly ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="accent"
                className={TOUCH_BUTTON}
                disabled={pending || withResults.length === 0}
                onClick={create}
              >
                {pending ? 'Wird angelegt …' : 'Auswertung anlegen'}
              </Button>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}

function ModuleRow({
  row,
  disabled,
  onToggle,
}: {
  row: AnalysisModuleRow;
  disabled: boolean;
  onToggle: (moduleId: string, included: boolean) => void;
}) {
  const name = label(row);
  const typeLabel =
    MODULE_LABELS_DE[row.moduleKey as keyof typeof MODULE_LABELS_DE] ?? row.moduleKey;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border p-3">
      {/* The label is the touch target, not the 16px box inside it: a browser
          run measured the row at 36px, below what a finger needs. `TOUCH_TARGET`
          drops back at `lg`, where a pointer is doing the work. */}
      <label className={`${TOUCH_TARGET} flex min-w-0 flex-1 items-center gap-3`}>
        <input
          type="checkbox"
          checked={row.included}
          disabled={disabled || !row.selectable}
          onChange={(event) => {
            onToggle(row.moduleId, event.target.checked);
          }}
          className="size-4 shrink-0 rounded border-input disabled:opacity-50"
        />

        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium break-words">{name}</span>
          <span className="text-xs text-muted-foreground">{typeLabel}</span>
        </span>
      </label>

      {row.archived ? <Badge variant="outline">Archiviert</Badge> : null}

      <Badge variant="secondary">
        {MODULE_STATUS_LABELS_DE[row.status as keyof typeof MODULE_STATUS_LABELS_DE] ?? row.status}
      </Badge>

      {row.recorded === 0 ? (
        /* Named, not merely disabled: a control that refuses without saying why
           is a puzzle, and the reason is knowable here. */
        <span className="text-xs text-muted-foreground">Noch keine Werte</span>
      ) : (
        <span className="text-xs text-muted-foreground" data-numeric>
          {row.recorded}/{row.expected} Werte ·{' '}
          {READINESS_LABELS_DE[row.level] ?? row.level.toLowerCase()}
        </span>
      )}
    </li>
  );
}
