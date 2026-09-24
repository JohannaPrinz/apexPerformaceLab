'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ExternalLink, EyeOff } from 'lucide-react';

import type { AthleteSex, Tendency } from '@apex/domain';

import { ActionMenu, ActionMenuItem } from '@/components/common/action-menu';
import type { ChartGroupView } from '@/components/common/measurement-chart';
import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';

import { setAnalysisModuleAction, setStillAction, updateDraftTextAction } from '../server/actions';

import { NewAnalysisButton } from './analysis-lifecycle';
import {
  documentFromEvaluation,
  mediaUrl,
  type DocumentMovement,
  type DocumentTarget,
} from './document';
import { ReportDocument } from './report-document';

/**
 * The analysis of one assessment, on the coach's side of the link.
 *
 * ## Why this file is thin
 *
 * The document is `ReportDocument`, and the athlete reads the very same
 * component. What lives here is only what the coach may *do*: choose which tests
 * the analysis draws on, and write into it. Sending it later takes nothing
 * away — so what a coach reads while editing is what the athlete receives, which
 * is the one thing the two-screen version could never promise.
 *
 * ## The basis is a line, not a list
 *
 * Which tests are drawn on used to be a permanently open list of checkboxes
 * above everything else. It is a decision made once and revisited rarely, so it
 * is a summary line that opens on demand.
 */

const BLOCK_REASONS: Readonly<Record<string, string>> = {
  NO_VALUES: 'Für diesen Test wurde kein Wert erfasst.',
  ARCHIVED: 'Dieser Test ist archiviert.',
};

export interface EvaluationSeriesView {
  readonly key: string;
  readonly typeName: string;
  readonly measurementTypeKey: string;
  readonly unit: string;
  readonly side: string;
  readonly exerciseName: string | null;
  readonly passIndex: number | null;
  readonly context: Record<string, string>;
  readonly source: string;
  readonly current: { value: number; capturedAt: Date };
  readonly previous: { value: number; capturedAt: Date } | null;
  readonly difference: number | null;
  readonly best: { value: number; capturedAt: Date } | null;
  readonly count: number;
  readonly betterDirection: 'lower' | 'higher' | null;
  readonly tendency: Tendency | null;
  readonly target: DocumentTarget | null;
  readonly percentile: { percentile: number; cohort: number } | null;
}

export interface EvaluationModuleView {
  readonly moduleId: string;
  readonly name: string;
  readonly typeLabel: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly blocked: string | null;
  readonly included: boolean;
  readonly recorded: number;
  readonly expected: number;
  readonly derivations: readonly string[];
  readonly protocolLabel: string | null;
  readonly series: readonly EvaluationSeriesView[];
  readonly images: readonly { id: string; key: string; label: string }[];
  readonly movement: DocumentMovement | null;
  readonly charts: readonly ChartGroupView[];
  /** Stills the analysis screen left for this test, whether chosen or not. */
  readonly offeredStills: readonly { key: string; label: string }[];
  readonly interpretation: string;
  readonly recommendation: string;
}

export interface EvaluationView {
  readonly reportId: string;
  readonly version: number;
  readonly assessment: { id: string; question: string; status: string; performedAt: Date };
  readonly athlete: {
    id: string;
    firstName: string;
    lastName: string;
    /** For the BMI and the age beside a body-composition test. Often absent. */
    heightCm: number | null;
    dateOfBirth: Date | null;
    /** What the strength standards are read against. Often absent as well. */
    weightKg: number | null;
    sex: AthleteSex;
  };
  readonly coachName: string;
  readonly summary: { tests: number; usable: number; included: number; values: number };
  readonly modules: readonly EvaluationModuleView[];
  readonly overall: { interpretation: string; recommendation: string };
}

export function AssessmentEvaluation({
  evaluation,
  locked = false,
}: {
  readonly evaluation: EvaluationView;
  /**
   * Whether the analysis may still be written into.
   *
   * A published analysis is frozen (§16), and one that has already been handed
   * to an athlete must not change under them either — the link they hold points
   * at what they were given. Locked, this renders exactly the document the
   * athlete sees, with nothing to type in.
   */
  readonly locked?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (moduleId: string, next: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await setAnalysisModuleAction(
        evaluation.assessment.id,
        evaluation.reportId,
        moduleId,
        next,
      );

      if (result.message) setError(result.message);
      else router.refresh();
    });
  };

  const save = (
    target: { kind: 'overall' } | { kind: 'section'; moduleId: string },
    field: 'interpretation' | 'recommendation',
    text: string,
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await updateDraftTextAction(evaluation.reportId, target, field, text);
      if (result.message) setError(result.message);
    });
  };

  const chooseStill = (moduleId: string, key: string, chosen: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await setStillAction(evaluation.reportId, moduleId, key, chosen);
      if (result.message) setError(result.message);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {locked ? (
        <p className="max-w-prose rounded-md border border-border bg-muted px-4 py-3 text-sm text-pretty">
          Diese Auswertung wurde bereits geteilt. Sie lässt sich nicht mehr ändern — der Link, den
          der Athlet hat, zeigt auf das, was er bekommen hat.
        </p>
      ) : null}

      <ReportDocument
        view={documentFromEvaluation(evaluation)}
        editing={
          locked
            ? undefined
            : {
                onText: save,
                disabled: pending,
                basis: <Basis evaluation={evaluation} pending={pending} onToggle={toggle} />,
                stillPicker: (moduleId) => {
                  const test = evaluation.modules.find((entry) => entry.moduleId === moduleId);
                  if (test === undefined || test.offeredStills.length === 0) return null;

                  return (
                    <StillPicker
                      offered={test.offeredStills}
                      chosen={test.images.map((image) => image.key)}
                      pending={pending}
                      onToggle={(key, next) => {
                        chooseStill(moduleId, key, next);
                      }}
                    />
                  );
                },
                testMenu: (moduleId) => (
                  <ActionMenu
                    label={`Aktionen: ${evaluation.modules.find((e) => e.moduleId === moduleId)?.name ?? 'Test'}`}
                  >
                    <ActionMenuItem asChild>
                      <Link href={`/assessments/${evaluation.assessment.id}/tests/${moduleId}`}>
                        <ExternalLink aria-hidden="true" />
                        Test öffnen
                      </Link>
                    </ActionMenuItem>

                    <ActionMenuItem
                      disabled={pending}
                      onClick={() => {
                        toggle(moduleId, false);
                      }}
                    >
                      <EyeOff aria-hidden="true" />
                      Aus der Auswertung nehmen
                    </ActionMenuItem>
                  </ActionMenu>
                ),
              }
        }
      />

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Which stills of a video analysis this document uses.
 *
 * Shown only to the coach, and only where the analysis screen actually left
 * some. A picked still is copied into the document at publication; an unpicked
 * one is never copied and expires with the rest of the analysis screen's
 * leftovers — so choosing here is an editorial decision, not a deletion.
 */
function StillPicker({
  offered,
  chosen,
  pending,
  onToggle,
}: {
  readonly offered: readonly { key: string; label: string }[];
  readonly chosen: readonly string[];
  readonly pending: boolean;
  readonly onToggle: (key: string, next: boolean) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2 border-t border-border pt-3">
      <legend className="sr-only">Standbilder aus der Videoanalyse</legend>
      <p className="text-xs text-muted-foreground">
        Standbilder aus der Videoanalyse — ausgewählte gehen mit der Auswertung an den Athleten.
      </p>

      <ul className="flex flex-wrap gap-2">
        {offered.map((still) => {
          const picked = chosen.includes(still.key);

          return (
            <li key={still.key}>
              <label
                className={`${FOCUS_RING} flex cursor-pointer flex-col gap-1 rounded border p-1 ${
                  picked ? 'border-accent bg-accent-soft' : 'border-border'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[0.6875rem]">
                  <input
                    type="checkbox"
                    checked={picked}
                    disabled={pending}
                    onChange={(event) => {
                      onToggle(still.key, event.target.checked);
                    }}
                    className="size-3.5 rounded border-input disabled:opacity-50"
                  />
                  {still.label} {picked ? '· übernommen' : '· übernehmen'}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element -- served
                    by a route that checks the session, not a public URL. */}
                <img
                  src={mediaUrl(still.key)}
                  alt={`Standbild: ${still.label}`}
                  loading="lazy"
                  className="h-16 w-auto rounded-sm object-cover"
                />
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/** Which tests the analysis draws on. One line, opened only when it is changed. */
function Basis({
  evaluation,
  pending,
  onToggle,
}: {
  readonly evaluation: EvaluationView;
  readonly pending: boolean;
  readonly onToggle: (moduleId: string, next: boolean) => void;
}) {
  const { summary, modules } = evaluation;

  return (
    <details className="rounded-md border border-border bg-card">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm">
        <span className="font-medium" data-numeric>
          {summary.included} von {summary.usable}{' '}
          {summary.usable === 1 ? 'auswertbarem Test' : 'auswertbaren Tests'}
        </span>
        <span className="text-muted-foreground" data-numeric>
          · {summary.values} {summary.values === 1 ? 'Messwert' : 'Messwerte'}
          {summary.tests > summary.usable
            ? ` · ${String(summary.tests - summary.usable)} ohne Werte`
            : ''}
        </span>
        <span className="ml-auto text-xs text-accent">Grundlage ändern</span>
      </summary>

      <div className="flex flex-col gap-2 border-t border-border p-3">
        <p className="max-w-prose text-xs text-pretty text-muted-foreground">
          Die Auswahl gehört zur Auswertung — der Test selbst bleibt unverändert.
        </p>

        <ul className="flex flex-col gap-1.5">
          {modules.map((entry) => (
            <li
              key={entry.moduleId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-border px-3 py-2"
            >
              <label className={`${TOUCH_TARGET} flex min-w-0 flex-1 items-center gap-3`}>
                <input
                  type="checkbox"
                  checked={entry.included}
                  disabled={pending || entry.blocked !== null}
                  onChange={(event) => {
                    onToggle(entry.moduleId, event.target.checked);
                  }}
                  className={`${FOCUS_RING} size-4 shrink-0 rounded border-input disabled:opacity-50`}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium break-words">{entry.name}</span>
                  <span className="text-xs text-muted-foreground">{entry.typeLabel}</span>
                </span>
              </label>

              {entry.blocked === null ? (
                <span
                  className="basis-full text-xs text-muted-foreground sm:basis-auto"
                  data-numeric
                >
                  {entry.recorded} von {entry.expected} Werten
                </span>
              ) : (
                /* Named, not merely disabled: a control that refuses without
                   saying why is a puzzle, and the reason is knowable here. */
                <span className="basis-full text-xs text-muted-foreground sm:basis-auto">
                  {BLOCK_REASONS[entry.blocked] ?? 'Nicht auswertbar.'}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/**
 * Offered where an assessment has no analysis yet.
 *
 * Creating one is a single press and nothing else: the analysis draws on every
 * test that recorded something, and everything a coach might disagree with is
 * editable afterwards. Asking for a title first would be a decision before there
 * is anything to decide about. The new draft opens straight away.
 */
export function StartEvaluation({ assessmentId }: { readonly assessmentId: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border p-6">
      <p className="max-w-prose text-sm text-pretty text-muted-foreground">
        Für dieses Assessment besteht noch keine Auswertung. Sie entsteht aus den erfassten Werten;
        alle auswertbaren Tests sind zunächst ausgewählt, und was Sie hineinschreiben, bleibt Ihres.
      </p>

      <NewAnalysisButton assessmentId={assessmentId} label="Auswertung anlegen" />
    </div>
  );
}
