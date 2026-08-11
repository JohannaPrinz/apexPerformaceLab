'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  allowedTransitions,
  ASSESSMENT_MODULE_STATUS_LABELS,
  MODULE_LABELS,
  type AssessmentModuleStatus,
  type ModuleConfiguration,
  type ModuleKey,
  type Readiness,
} from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { addModuleNoteAction, setModuleStatusAction } from '../server/actions';

import { MeasurementCell } from './measurement-cell';
import {
  formatValue,
  isPassEmpty,
  passesOf,
  passProgress,
  slotsForPass,
  type RecordedMeasurement,
} from './slots';

/**
 * Performing a test.
 *
 * Everything on this screen is derived from `configuration` — how many stages,
 * which quantities, whether both sides are taken, which dimensions. A lactate
 * step test, a grip-strength test and a per-joint mobility screen render
 * through the same code; there is no branch on the module key anywhere.
 *
 * **The screen never decides readiness.** It shows what the domain service
 * returned. A completed test may read PARTIAL, and that is the point: status is
 * how far the coach got, readiness is what the data supports.
 */
export function TestRunner({
  moduleId,
  moduleKey,
  status,
  configuration,
  types,
  measurements,
  superseded,
  notes,
  readiness,
  canEdit,
}: {
  moduleId: string;
  moduleKey: string;
  status: AssessmentModuleStatus;
  configuration: ModuleConfiguration | null;
  types: Record<string, { name: string; unit: string; valueType: string }>;
  measurements: RecordedMeasurement[];
  superseded: RecordedMeasurement[];
  notes: { id: string; body: string; createdAt: Date }[];
  readiness: Readiness;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [activePass, setActivePass] = useState<number | null>(null);

  if (!configuration) {
    return (
      <p className="text-sm text-muted-foreground">
        This test was configured under a shape that can no longer be read. Its measurements are
        unaffected.
      </p>
    );
  }

  const passes = passesOf(configuration);
  const currentPass = activePass ?? passes[0] ?? null;
  const slots = slotsForPass(configuration);
  const progress = passProgress(configuration, measurements, currentPass);

  function changeStatus(next: AssessmentModuleStatus) {
    setError(null);
    startTransition(async () => {
      const result = await setModuleStatusAction(moduleId, next);
      if (result.message) setError(result.message);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Test</span>
          <h2 className="text-xl font-semibold">
            {MODULE_LABELS[moduleKey as ModuleKey] ?? moduleKey}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status === 'COMPLETED' ? 'accent' : 'secondary'}>
              {ASSESSMENT_MODULE_STATUS_LABELS[status]}
            </Badge>
            <ReadinessBadge readiness={readiness} />
          </div>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {allowedTransitions(status).map((next) => (
              <Button
                key={next}
                size="sm"
                variant={next === 'IN_PROGRESS' ? 'accent' : 'outline'}
                disabled={pending}
                onClick={() => changeStatus(next)}
              >
                {actionLabel(status, next)}
              </Button>
            ))}
          </div>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {passes.length > 1 ? (
        <nav aria-label="Passes" className="flex flex-wrap items-center gap-2">
          {passes.map((pass) => {
            const empty = isPassEmpty(measurements, pass);
            const active = pass === currentPass;

            return (
              <button
                key={String(pass)}
                type="button"
                onClick={() => setActivePass(pass)}
                aria-current={active ? 'step' : undefined}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? 'border-accent bg-accent-soft text-accent-soft-foreground'
                    : 'border-border hover:border-border-strong'
                }`}
              >
                Stage {pass}
                {empty ? (
                  <span className="text-muted-foreground"> · skipped</span>
                ) : (
                  <span className="text-muted-foreground">
                    {' · '}
                    {passProgress(configuration, measurements, pass).filled}/
                    {passProgress(configuration, measurements, pass).expected}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      ) : null}

      <section className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {passes.length > 1 ? `Stage ${String(currentPass)} · ` : ''}
          {progress.filled} of {progress.expected} recorded
          {progress.filled < progress.expected
            ? ' — a value left empty stays empty; nothing is filled in.'
            : ''}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {slots.map((slot) => (
            <MeasurementCell
              key={slot.key}
              slot={slot}
              passIndex={currentPass}
              moduleId={moduleId}
              measurements={measurements}
              type={types[slot.measurementTypeId]}
              readOnly={!canEdit}
            />
          ))}
        </div>
      </section>

      {superseded.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Corrected values</h3>
          <p className="text-xs text-muted-foreground">
            Superseded readings are never deleted — an erroneous measurement is part of the record
            (§13).
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {superseded.map((measurement) => (
              <li key={measurement.id} className="text-muted-foreground">
                <span data-numeric>{formatValue(measurement)}</span>
                {' · '}
                {types[measurement.measurementTypeId]?.name ?? 'Unknown'}
                {measurement.passIndex ? ` · stage ${String(measurement.passIndex)}` : ''}
                {measurement.note ? ` · ${measurement.note}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Test notes</h3>

        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No note yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map((note) => (
              <li key={note.id} className="rounded-md border border-border px-3 py-2 text-sm">
                {note.body}
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <div className="flex gap-2">
            <input
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="e.g. athlete stopped because of pain"
              aria-label="Test note"
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={pending || noteDraft.trim() === ''}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await addModuleNoteAction(moduleId, noteDraft.trim());
                  if (result.message) setError(result.message);
                  else {
                    setNoteDraft('');
                    router.refresh();
                  }
                });
              }}
            >
              Add note
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** The readiness the domain service computed. The screen only displays it. */
function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  if (readiness.level === 'COMPLETE') return <Badge variant="accent">Fully evaluable</Badge>;
  if (readiness.level === 'PARTIAL') {
    return (
      <Badge variant="secondary">
        Partially evaluable
        {readiness.missingPasses.length > 0
          ? ` · missing stage ${readiness.missingPasses.join(', ')}`
          : ''}
      </Badge>
    );
  }

  return <Badge variant="outline">Not evaluable</Badge>;
}

/** Wording that says what happens, not what the enum is called. */
function actionLabel(from: AssessmentModuleStatus, to: AssessmentModuleStatus): string {
  if (to === 'IN_PROGRESS') return from === 'PLANNED' ? 'Start test' : 'Reopen';
  if (to === 'COMPLETED') return 'Mark complete';
  if (to === 'SKIPPED') return 'Skip test';
  if (to === 'ABORTED') return 'Abort test';

  return ASSESSMENT_MODULE_STATUS_LABELS[to];
}
