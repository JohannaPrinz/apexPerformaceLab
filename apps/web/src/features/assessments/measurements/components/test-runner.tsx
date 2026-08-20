'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  allowedTransitions,
  type AssessmentModuleStatus,
  type ModuleConfiguration,
  type ModuleKey,
  type Readiness,
} from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';

import {
  MODULE_LABELS_DE,
  MODULE_STATUS_LABELS_DE,
  READINESS_LABELS_DE,
} from '../../components/labels';
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
  moduleName,
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
  /** What the coach called this test; falls back to the type when absent. */
  moduleName?: string | null;
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
        Dieser Test wurde mit einer Struktur konfiguriert, die nicht mehr gelesen werden kann. Die
        Messwerte sind davon nicht betroffen.
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
        <div className="flex min-w-0 flex-col gap-1">
          <span className="eyebrow">{MODULE_LABELS_DE[moduleKey as ModuleKey] ?? moduleKey}</span>
          {/* `h1`, not `h2`: this component *is* the page — the route around
              it renders only a back link. A page whose first heading is level
              two leaves a screen reader without a title to jump to. */}
          <h1 className="text-xl font-semibold break-words">
            {(moduleName ?? '') !== ''
              ? moduleName
              : (MODULE_LABELS_DE[moduleKey as ModuleKey] ?? moduleKey)}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status === 'COMPLETED' ? 'accent' : 'secondary'}>
              {MODULE_STATUS_LABELS_DE[status]}
            </Badge>
            <ReadinessBadge readiness={readiness} />
          </div>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {allowedTransitions(status).map((next) => (
              <Button
                key={next}
                className={TOUCH_BUTTON}
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
        <nav aria-label="Stufen" className="flex flex-wrap items-center gap-2">
          {passes.map((pass) => {
            const empty = isPassEmpty(measurements, pass);
            const active = pass === currentPass;

            return (
              <button
                key={String(pass)}
                type="button"
                onClick={() => setActivePass(pass)}
                aria-current={active ? 'step' : undefined}
                className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-md border px-4 text-sm transition-colors ${
                  active
                    ? 'border-accent bg-accent-soft text-accent-soft-foreground'
                    : 'border-border hover:border-border-strong'
                }`}
              >
                Stufe {pass}
                {empty ? (
                  // "leer", not "übersprungen": at the start of a test every
                  // stage is empty, and calling that skipped claims a decision
                  // nobody took. Skipping is a status on the test itself.
                  <span className="text-muted-foreground"> · leer</span>
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
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {passes.length > 1 ? `Stufe ${String(currentPass)} · ` : ''}
          {progress.filled} von {progress.expected} erfasst
          {progress.filled < progress.expected
            ? ' — ein leer gelassener Wert bleibt leer; es wird nichts ergänzt.'
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
          <h3 className="text-sm font-medium">Korrigierte Werte</h3>
          <p className="text-xs text-muted-foreground">
            Ersetzte Messwerte werden nie gelöscht — auch ein fehlerhafter Wert gehört zur
            Dokumentation (§13).
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {superseded.map((measurement) => (
              <li key={measurement.id} className="text-muted-foreground">
                <span data-numeric>{formatValue(measurement)}</span>
                {' · '}
                {types[measurement.measurementTypeId]?.name ?? 'Unbekannt'}
                {measurement.passIndex ? ` · Stufe ${String(measurement.passIndex)}` : ''}
                {measurement.note ? ` · ${measurement.note}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Testnotizen</h3>

        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch keine Notiz.</p>
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
              placeholder="z. B. Athlet hat wegen Schmerzen abgebrochen"
              aria-label="Testnotiz"
              className={`${TOUCH_FIELD} min-w-0 flex-1 rounded-md border border-input bg-background px-3`}
            />
            <Button
              className={TOUCH_BUTTON}
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
              Notiz hinzufügen
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** The readiness the domain service computed. The screen only displays it. */
function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  if (readiness.level === 'COMPLETE')
    return <Badge variant="accent">{READINESS_LABELS_DE['COMPLETE']}</Badge>;
  if (readiness.level === 'PARTIAL') {
    return (
      <Badge variant="secondary">
        {READINESS_LABELS_DE['PARTIAL']}
        {readiness.missingPasses.length > 0
          ? ` · Stufe ${readiness.missingPasses.join(', ')} fehlt`
          : ''}
      </Badge>
    );
  }

  return <Badge variant="outline">{READINESS_LABELS_DE['INSUFFICIENT']}</Badge>;
}

/** Wording that says what happens, not what the enum is called. */
function actionLabel(from: AssessmentModuleStatus, to: AssessmentModuleStatus): string {
  if (to === 'IN_PROGRESS') return from === 'PLANNED' ? 'Test starten' : 'Wieder öffnen';
  if (to === 'COMPLETED') return 'Abschließen';
  if (to === 'SKIPPED') return 'Überspringen';
  if (to === 'ABORTED') return 'Test abbrechen';

  return MODULE_STATUS_LABELS_DE[to];
}
