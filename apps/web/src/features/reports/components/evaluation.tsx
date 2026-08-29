'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import type { DraftField } from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_TARGET } from '@/components/common/touch';

import {
  createAnalysisAction,
  setAnalysisModuleAction,
  updateDraftTextAction,
} from '../server/actions';

import { SeriesTable, type SeriesRow } from './series-table';

/**
 * The analysis of one assessment, on its own screen.
 *
 * ## What the screen is built around
 *
 * Facts first, and they are **rendered, never typed**: everything above a text
 * box comes from the measurements as they stand, so it cannot go stale and there
 * is nothing to overwrite. Everything in a text box is the coach's, and nothing
 * here ever writes into one.
 *
 * ## The fill state is said once
 *
 * One line, three numbers. The screen this replaced stated it seven times in
 * five different denominators, which left a coach reconciling the page against
 * itself instead of reading it.
 *
 * ## Empty is not the same as unavailable
 *
 * A reference group and a potential are shown as what they are — not yet
 * possible, with the reason. An interpretation and a recommendation are shown as
 * empty fields, because they are the coach's to fill. Neither is faked, and
 * neither is hidden: a block that vanished would leave a coach wondering whether
 * they had missed it.
 */

const NUMBER = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const BLOCK_REASONS: Readonly<Record<string, string>> = {
  NO_VALUES: 'Für diesen Test wurde kein Wert erfasst.',
  ARCHIVED: 'Dieser Test ist archiviert.',
};

export interface EvaluationModuleView {
  readonly moduleId: string;
  readonly name: string;
  readonly typeLabel: string;
  readonly status: string;
  readonly blocked: string | null;
  readonly included: boolean;
  readonly recorded: number;
  readonly expected: number;
  readonly derivations: readonly string[];
  readonly protocolLabel: string | null;
  readonly series: readonly SeriesRow[];
  readonly interpretation: string;
  readonly recommendation: string;
}

export interface EvaluationView {
  readonly reportId: string;
  readonly version: number;
  readonly assessment: { id: string; question: string; status: string; performedAt: Date };
  readonly athlete: { id: string; firstName: string; lastName: string };
  readonly summary: { tests: number; usable: number; included: number; values: number };
  readonly modules: readonly EvaluationModuleView[];
  readonly overall: { interpretation: string; recommendation: string };
}

export function AssessmentEvaluation({ evaluation }: { readonly evaluation: EvaluationView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { summary, modules } = evaluation;
  const included = modules.filter((entry) => entry.included);
  const selectable = modules.filter((entry) => entry.blocked === null);
  const blocked = modules.filter((entry) => entry.blocked !== null);

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

  const save =
    (target: { kind: 'overall' } | { kind: 'section'; moduleId: string }) =>
    (field: DraftField, text: string) => {
      setError(null);
      startTransition(async () => {
        const result = await updateDraftTextAction(evaluation.reportId, target, field, text);
        if (result.message) setError(result.message);
      });
    };

  return (
    <div className="flex flex-col gap-8">
      {/* One line, three numbers, said once. */}
      <section aria-label="Umfang" className="flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-numeric>
          <span className="font-medium text-foreground">
            {summary.included} von {summary.usable}{' '}
            {summary.usable === 1 ? 'auswertbarem Test' : 'auswertbaren Tests'} einbezogen
          </span>
          <span className="text-muted-foreground">
            · {summary.values} {summary.values === 1 ? 'Messwert' : 'Messwerte'}
            {summary.tests > summary.usable
              ? ` · ${String(summary.tests - summary.usable)} ohne Werte`
              : ''}
          </span>
        </p>
      </section>

      {/* The basis, only where there is something to decide. */}
      {selectable.length > 1 || blocked.length > 0 ? (
        <section aria-labelledby="basis" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="basis" className="text-base font-medium">
              Grundlage
            </h2>
            <p className="max-w-prose text-sm text-pretty text-muted-foreground">
              Welche Tests diese Auswertung heranzieht. Die Auswahl gehört zur Auswertung — der Test
              selbst bleibt unverändert.
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {modules.map((entry) => (
              <li
                key={entry.moduleId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border p-3"
              >
                <label className={`${TOUCH_TARGET} flex min-w-0 flex-1 items-center gap-3`}>
                  <input
                    type="checkbox"
                    checked={entry.included}
                    disabled={pending || entry.blocked !== null}
                    onChange={(event) => {
                      toggle(entry.moduleId, event.target.checked);
                    }}
                    className="size-4 shrink-0 rounded border-input disabled:opacity-50"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium break-words">{entry.name}</span>
                    <span className="text-xs text-muted-foreground">{entry.typeLabel}</span>
                  </span>
                </label>

                {/* Its own line below the name on a phone: measured at 375 the
                    reason squeezed "Nie erfasst" onto three lines. `basis-full`
                    rather than a hidden column, because the reason is the point
                    of the row. */}
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
        </section>
      ) : null}

      {included.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Diese Auswertung zieht noch keinen Test heran.
        </p>
      ) : (
        included.map((entry) => (
          <ModuleBlock
            key={entry.moduleId}
            module={entry}
            onSave={save({ kind: 'section', moduleId: entry.moduleId })}
          />
        ))
      )}

      {/* The analysis as a whole, last — it is written after reading the tests. */}
      <section
        aria-labelledby="overall"
        className="flex flex-col gap-3 border-t border-border pt-6"
      >
        <h2 id="overall" className="text-lg font-semibold">
          Gesamtauswertung
        </h2>

        <TextField
          id="overall-interpretation"
          label="Einschätzung über alle Tests"
          hint="Was ergibt sich aus den Ergebnissen zusammengenommen?"
          value={evaluation.overall.interpretation}
          disabled={pending}
          onSave={(text) => {
            save({ kind: 'overall' })('interpretation', text);
          }}
        />

        <TextField
          id="overall-recommendation"
          label="Empfehlung"
          hint="Was schlagen Sie vor?"
          value={evaluation.overall.recommendation}
          disabled={pending}
          onSave={(text) => {
            save({ kind: 'overall' })('recommendation', text);
          }}
        />
      </section>

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ModuleBlock({
  module: entry,
  onSave,
}: {
  readonly module: EvaluationModuleView;
  readonly onSave: (field: DraftField, text: string) => void;
}) {
  /**
   * The distance to the coach's own best value.
   *
   * The one potential that can be stated today, and only because a yardstick
   * exists: a best value appears solely where the test's protocol declares which
   * direction is wanted. Three states, and the middle one is the reason this is
   * not a one-liner — a browser run showed "no direction declared" printed
   * beside a best-value column, because the current reading *was* the best and
   * the distance was zero.
   */
  const withBest = entry.series.filter((row) => row.best !== null);
  const gaps = withBest
    .map((row) => ({
      row,
      gap: Math.round((row.current.value - (row.best?.value ?? 0)) * 100) / 100,
    }))
    .filter((found) => found.gap !== 0);

  const potential =
    withBest.length === 0
      ? 'erscheint, sobald für diesen Test eine angestrebte Richtung hinterlegt ist.'
      : gaps.length === 0
        ? 'Der aktuelle Wert ist zugleich der Bestwert dieser Reihe.'
        : gaps
            .map(
              (found) =>
                `${found.row.typeName}: ${NUMBER.format(Math.abs(found.gap))}${
                  found.row.unit === '' ? '' : ` ${found.row.unit}`
                } zum eigenen Bestwert vom ${DATE.format(found.row.best?.capturedAt ?? new Date())}`,
            )
            .join(' · ');

  return (
    <section
      aria-label={entry.name}
      className="flex flex-col gap-4 rounded-md border border-border p-4"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold break-words">{entry.name}</h2>
        <span className="text-xs text-muted-foreground">{entry.typeLabel}</span>
        {entry.protocolLabel === null ? null : (
          <Badge variant="outline">{entry.protocolLabel}</Badge>
        )}
      </div>

      {entry.derivations.length === 0 ? null : (
        <p className="text-xs text-muted-foreground">
          Berechnet nach {entry.derivations.join(', ')}.
        </p>
      )}

      <SeriesTable rows={entry.series} />

      {/* Prepared, honest, and not repeated per row: neither statement is about
          a single number. */}
      <p className="max-w-prose text-xs text-pretty text-muted-foreground">
        <span className="font-medium">Referenzgruppe:</span> keine hinterlegt — Apex OS führt keine
        Normwerte. <span className="font-medium">Verbesserungspotenzial:</span> {potential}
      </p>

      <TextField
        id={`interpretation-${entry.moduleId}`}
        label="Einordnung"
        hint="Was bedeuten diese Werte fachlich?"
        value={entry.interpretation}
        disabled={false}
        onSave={(text) => {
          onSave('interpretation', text);
        }}
      />

      <TextField
        id={`recommendation-${entry.moduleId}`}
        label="Empfehlung"
        hint="Was folgt daraus für diesen Test?"
        value={entry.recommendation}
        disabled={false}
        onSave={(text) => {
          onSave('recommendation', text);
        }}
      />
    </section>
  );
}

/**
 * One text the coach writes.
 *
 * Saved on leaving the field: a paragraph is written, not typed at, and a write
 * behind every letter would be a write behind every letter. The value is held
 * locally so a re-render caused by saving another field cannot pull half-typed
 * text out from under the cursor.
 */
function TextField({
  id,
  label,
  hint,
  value,
  disabled,
  onSave,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onSave: (text: string) => void;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);

  // Adjusted during render rather than in an effect: an effect would paint the
  // old text first and replace it a frame later.
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        value={text}
        disabled={disabled}
        rows={3}
        placeholder={hint}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onBlur={() => {
          if (text !== value) onSave(text);
        }}
        className={`${FOCUS_RING} min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base disabled:opacity-50 lg:text-sm`}
      />
    </div>
  );
}

/**
 * Offered where an assessment has no analysis yet.
 *
 * Creating one is a single press and nothing else: the analysis draws on the
 * tests that recorded something, and everything a coach might disagree with is
 * editable afterwards. Asking for a title first would be a decision before there
 * is anything to decide about.
 */
export function StartEvaluation({ assessmentId }: { readonly assessmentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createAnalysisAction(assessmentId, 'Auswertung');
      if (result.message) setError(result.message);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border p-6">
      <p className="max-w-prose text-sm text-pretty text-muted-foreground">
        Für dieses Assessment besteht noch keine Auswertung. Sie entsteht aus den erfassten Werten;
        was Sie hineinschreiben, bleibt Ihres.
      </p>

      <Button
        type="button"
        variant="accent"
        className={TOUCH_BUTTON}
        disabled={pending}
        onClick={create}
      >
        {pending ? 'Wird angelegt …' : 'Auswertung anlegen'}
      </Button>

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
