'use client';

import { Fragment, useRef, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Check } from 'lucide-react';

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
import {
  addModuleNoteAction,
  saveStageAction,
  setModuleStatusAction,
  type StageEntry,
} from '../server/actions';

import { EMPTY_DRAFT, MeasurementCell, type SlotDraft } from './measurement-cell';
import {
  findRecorded,
  formatValue,
  isPassEmpty,
  passesOf,
  passProgress,
  slotsForPass,
  type MeasurementSlot,
  type RecordedMeasurement,
} from './slots';
import { TestSummary } from './test-summary';

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
 *
 * **Superseded values are not shown here.** They are never deleted (§13) and
 * stay readable in the record, but a screen for taking measurements should show
 * what is true now — a column of replaced readings underneath the live ones
 * invites reading the wrong number off a tablet mid-session.
 */
export function TestRunner({
  moduleId,
  moduleKey,
  moduleName,
  status,
  configuration,
  types,
  exercises,
  measurements,
  notes,
  readiness,
  assessmentId,
  canEdit,
}: {
  moduleId: string;
  moduleKey: string;
  /** What the coach called this test; falls back to the type when absent. */
  moduleName?: string | null;
  status: AssessmentModuleStatus;
  configuration: ModuleConfiguration | null;
  types: Record<string, { name: string; unit: string; valueType: string }>;
  /** Exercise id → display name, for the movements this test covers. */
  exercises: Record<string, string>;
  measurements: RecordedMeasurement[];
  notes: { id: string; body: string; passIndex: number | null; createdAt: Date }[];
  readiness: Readiness;
  assessmentId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [activePass, setActivePass] = useState<number | null>(null);
  // Keyed by stage *and* slot, so moving between stages to check something does
  // not quietly discard what was already typed on the one being left.
  const [draft, setDraft] = useState<Record<string, SlotDraft>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // `pending` flips a render late; a second tap lands before it. The ref shuts
  // the door in the same tick, which is what stops a stage being written twice.
  const saving = useRef(false);
  /**
   * Whether the coach is entering values or looking at what they just entered.
   *
   * Always starts on the stages. This route *is* the entry screen — reading a
   * finished test happens on its overview, which is what a tile opens. The
   * summary here is the last step of a run, not a way to view the test.
   */
  const [view, setView] = useState<'stages' | 'summary'>('stages');

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
  const currentIndex = passes.indexOf(currentPass);
  const nextPass = currentIndex >= 0 ? passes[currentIndex + 1] : undefined;

  /**
   * The notes worth reading right now.
   *
   * On a stage, the notes about that stage plus the ones about the test as a
   * whole — a remark that applies everywhere applies here too. Everything a
   * test holds is on its overview; this is the working subset.
   */
  const visibleNotes =
    view === 'summary' || passes.length <= 1
      ? notes
      : notes.filter((note) => note.passIndex === null || note.passIndex === currentPass);

  const draftKey = (slot: MeasurementSlot) => `${String(currentPass)}|${slot.key}`;
  const draftOf = (slot: MeasurementSlot) => draft[draftKey(slot)] ?? EMPTY_DRAFT;

  function goTo(pass: number | null) {
    setActivePass(pass);
    setFieldErrors({});
  }

  /**
   * One stage on — or, past the last one, to the summary.
   *
   * The last stage used to have nowhere to go, which is why it could not be
   * skipped: a disabled button was the only honest thing to show. It has a
   * destination now, so it can.
   */
  function advance() {
    if (nextPass === undefined) {
      setView('summary');
      setFieldErrors({});

      return;
    }

    goTo(nextPass);
  }

  /**
   * What the coach typed, turned into the values this stage would write.
   *
   * Three things are decided here and nowhere else: an empty cell writes
   * nothing (a value left blank stays blank — the screen never fills a gap), a
   * cell holding what is already stored writes nothing either (pressing
   * "Weiter" twice must not produce a correction that changes nothing), and a
   * cell over an existing value becomes a *correction* rather than a second
   * reading of the same slot.
   */
  function collectStage(): { entries: StageEntry[]; localErrors: Record<string, string> } {
    const entries: StageEntry[] = [];
    const localErrors: Record<string, string> = {};

    for (const slot of slots) {
      const cell = draftOf(slot);
      const raw = cell.value.trim();
      if (raw === '') continue;

      const valueType = types[slot.measurementTypeId]?.valueType ?? 'NUMERIC';
      const value = parseValue(raw, valueType);

      if (value === null) {
        localErrors[slot.key] = 'Bitte eine Zahl eingeben.';
        continue;
      }

      const context = { ...slot.context, ...cell.context };
      const existing = findRecorded(measurements, slot, currentPass);

      if (existing === undefined) {
        entries.push({
          kind: 'record',
          slotKey: slot.key,
          input: {
            moduleId,
            measurementTypeId: slot.measurementTypeId,
            value,
            side: slot.side,
            passIndex: currentPass,
            // The slot was built per exercise; dropping it here made every
            // test that works in movements refuse its whole stage.
            exerciseId: slot.exerciseId,
            context: Object.keys(context).length > 0 ? context : null,
            note: null,
          },
        });
      } else if (!isUnchanged(existing, value)) {
        entries.push({
          kind: 'correct',
          slotKey: slot.key,
          input: { measurementId: existing.id, value, note: null },
        });
      }
    }

    return { entries, localErrors };
  }

  /**
   * Saves the stage and moves on — the one button this screen is built around.
   *
   * On failure it stays put: the stage is written whole or not at all, so
   * anything still in a field is still unsaved, and clearing it would destroy
   * the only copy. On success the stage's draft is dropped, because it now
   * lives in the record the page is about to re-read.
   */
  function saveStage() {
    if (saving.current) return;

    const { entries, localErrors } = collectStage();

    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);

      return;
    }

    setError(null);
    setFieldErrors({});

    if (entries.length === 0) {
      advance();

      return;
    }

    saving.current = true;
    startTransition(async () => {
      try {
        const result = await saveStageAction(entries);

        if (result.fieldErrors) {
          setFieldErrors(
            Object.fromEntries(result.fieldErrors.map((entry) => [entry.slotKey, entry.message])),
          );

          return;
        }

        if (result.message) {
          setError(result.message);

          return;
        }

        setDraft((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([key]) => !key.startsWith(`${String(currentPass)}|`)),
          ),
        );
        advance();
        router.refresh();
      } finally {
        saving.current = false;
      }
    });
  }

  function changeStatus(next: AssessmentModuleStatus) {
    setError(null);
    startTransition(async () => {
      const result = await setModuleStatusAction(moduleId, next);
      if (result.message) setError(result.message);
      else router.refresh();
    });
  }

  /**
   * Finishing the test from the summary.
   *
   * A test that was never explicitly started is still `PLANNED`, and
   * `PLANNED → COMPLETED` is refused — deliberately, because an examination
   * that produced values was never merely planned. But a coach who has just
   * worked through every stage has plainly started it, and meeting "A planned
   * test cannot become completed" at the end of the run is a dead end.
   *
   * So both legal moves are made, in order. No rule is bent: each transition is
   * one the domain permits, and the second only runs if the first succeeded.
   */
  function completeTest() {
    setError(null);
    startTransition(async () => {
      if (status === 'PLANNED') {
        const started = await setModuleStatusAction(moduleId, 'IN_PROGRESS');
        if (started.message) {
          setError(started.message);

          return;
        }
      }

      const result = await setModuleStatusAction(moduleId, 'COMPLETED');
      if (result.message) {
        setError(result.message);

        return;
      }

      // Finishing a test ends the run and opens what the test now says. The
      // overview is where "abgeschlossen am", the corrected values and the
      // notes live; staying here would leave the coach on an entry grid for a
      // test they have just declared finished.
      router.push(`/assessments/${assessmentId}/tests/${moduleId}`);
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

          {/* What this test was configured to cover. It was invisible here
              before: a coach who set the test up to record the knee and the hip
              saw neither on the screen where they take the readings, and had to
              go back to the configuration to check. */}
          {configuration.dimensions.length > 0 || configuration.exerciseIds.length > 0 ? (
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs [&>dd]:min-w-0 [&>dd]:break-words">
              {configuration.exerciseIds.length > 0 ? (
                <>
                  <dt className="text-muted-foreground">Übungen</dt>
                  <dd>
                    {configuration.exerciseIds
                      .map((id) => exercises[id] ?? 'Unbekannte Übung')
                      .join(' · ')}
                  </dd>
                </>
              ) : null}

              {configuration.dimensions.map((dimension) => (
                <Fragment key={dimension.key}>
                  <dt className="text-muted-foreground">{dimension.label}</dt>
                  <dd>
                    {dimension.values && dimension.values.length > 0
                      ? dimension.values.join(' · ')
                      : 'wird bei der Messung benannt'}
                  </dd>
                </Fragment>
              ))}
            </dl>
          ) : null}
        </div>

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {/* None of these is the accent action. The primary action on this
                screen is "Weiter" in the stage footer — that is the work. Two
                accent buttons on one screen leave the coach choosing between
                two things that both look like the way forward. */}
            {allowedTransitions(status).map((next) => (
              <Button
                key={next}
                className={TOUCH_BUTTON}
                variant="outline"
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

      {view === 'summary' ? (
        <TestSummary
          configuration={configuration}
          measurements={measurements}
          pending={pending}
          onComplete={completeTest}
          onBackToStages={() => {
            setView('stages');
          }}
        />
      ) : (
        <>
          {passes.length > 1 ? (
            <nav aria-label="Stufen" className="flex flex-wrap items-center gap-2">
              {passes.map((pass) => {
                const empty = isPassEmpty(measurements, pass);
                const active = pass === currentPass;
                const filled = passProgress(configuration, measurements, pass);
                const stageFilled = { ...filled, complete: filled.filled >= filled.expected };

                return (
                  <button
                    key={String(pass)}
                    type="button"
                    onClick={() => {
                      goTo(pass);
                    }}
                    aria-current={active ? 'step' : undefined}
                    className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-md border px-4 text-sm transition-colors ${
                      active
                        ? 'border-accent bg-accent-soft text-accent-soft-foreground'
                        : stageFilled.complete
                          ? 'border-border bg-muted hover:border-border-strong'
                          : 'border-border hover:border-border-strong'
                    }`}
                  >
                    Stufe {pass}
                    {empty ? (
                      // "leer", not "übersprungen": at the start of a test every
                      // stage is empty, and calling that skipped claims a decision
                      // nobody took. Skipping is a status on the test itself.
                      <span className="text-muted-foreground"> · leer</span>
                    ) : stageFilled.complete ? (
                      // A tick rather than "4/4": the question a coach scans this
                      // row for is "which stage still needs something", and a pair
                      // of numbers has to be read and compared before it answers.
                      <Check
                        aria-hidden="true"
                        className="ml-1.5 inline size-4 align-text-bottom"
                      />
                    ) : (
                      <span className="text-muted-foreground">
                        {' · '}
                        {stageFilled.filled}/{stageFilled.expected}
                      </span>
                    )}
                    <span className="sr-only">
                      {empty
                        ? ' — noch nichts erfasst'
                        : stageFilled.complete
                          ? ' — vollständig erfasst'
                          : ` — ${String(stageFilled.filled)} von ${String(stageFilled.expected)} erfasst`}
                    </span>
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
                  measurements={measurements}
                  type={types[slot.measurementTypeId]}
                  draft={draftOf(slot)}
                  onChange={(patch) => {
                    setDraft((current) => ({
                      ...current,
                      [draftKey(slot)]: { ...(current[draftKey(slot)] ?? EMPTY_DRAFT), ...patch },
                    }));
                    // The message described the value that was refused. It no
                    // longer does.
                    setFieldErrors(({ [slot.key]: _cleared, ...rest }) => rest);
                  }}
                  error={fieldErrors[slot.key]}
                  readOnly={!canEdit}
                />
              ))}
            </div>
          </section>

          {canEdit ? (
            <div
              // Sticky, because a stage of eight values is taller than a phone and
              // the way on must not be something the coach has to scroll for.
              //
              // `-mx-6` cancels the page's own `px-6` so the bar reaches the edges
              // of a phone screen; without it the stage scrolls past in a gutter
              // beside the bar, which reads as a rendering fault. That is a
              // deliberate coupling to the route's padding — if the page's padding
              // changes, this changes with it.
              className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-6 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border sm:px-4"
            >
              <Button
                variant="ghost"
                className={TOUCH_BUTTON}
                disabled={pending}
                onClick={() => {
                  // Writes nothing at all. The draft is kept rather than cleared:
                  // skipping ahead is a change of view, not a decision to discard.
                  advance();
                }}
              >
                Stufe überspringen
              </Button>

              <Button
                variant="accent"
                className={TOUCH_BUTTON}
                disabled={pending}
                onClick={() => {
                  saveStage();
                }}
              >
                {pending
                  ? 'Wird gespeichert …'
                  : nextPass === undefined
                    ? 'Speichern und abschließen'
                    : 'Weiter'}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">
          {passes.length > 1 && view === 'stages'
            ? `Notizen zu Stufe ${String(currentPass)}`
            : 'Testnotizen'}
        </h3>
        <p className="text-xs text-pretty text-muted-foreground">
          {passes.length > 1 && view === 'stages'
            ? 'Was bei dieser Stufe aufgefallen ist. Eine Notiz gehört zur Stufe, nicht zu einem einzelnen Wert.'
            : 'Was bei diesem Test aufgefallen ist.'}
        </p>

        {visibleNotes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch keine Notiz.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleNotes.map((note) => (
              <li key={note.id} className="rounded-md border border-border px-3 py-2 text-sm">
                {note.passIndex === null ? null : (
                  <span className="mr-1.5 text-xs text-muted-foreground">
                    Stufe {note.passIndex} ·
                  </span>
                )}
                {note.body}
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <input
              value={noteDraft}
              onChange={(event) => {
                setNoteDraft(event.target.value);
              }}
              placeholder="z. B. Athlet klagte über Schmerzen"
              aria-label={
                passes.length > 1 && view === 'stages'
                  ? `Notiz zu Stufe ${String(currentPass)}`
                  : 'Testnotiz'
              }
              className={`${TOUCH_FIELD} min-w-0 flex-1 rounded-md border border-input bg-background px-3`}
            />
            <Button
              className={TOUCH_BUTTON}
              variant="outline"
              disabled={pending || noteDraft.trim() === ''}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  // The stage the note belongs to, or null on the summary and
                  // on a single-pass test — where "this stage" and "this test"
                  // are the same thing and the narrower claim would be false.
                  const result = await addModuleNoteAction(
                    moduleId,
                    noteDraft.trim(),
                    passes.length > 1 && view === 'stages' ? currentPass : null,
                  );
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

/**
 * The typed text as the column expects it, or `null` when it is not a value.
 *
 * Only numbers can be *typed* wrongly — text is text and the select offers two
 * options — so `null` means one thing: a number field holding something that is
 * not a number. Both separators are accepted; a German keyboard produces a
 * comma, and rejecting that would be rejecting the coach's own keyboard.
 *
 * The server checks all of this again. This exists so an obvious slip is caught
 * before the stage is sent, not so the rule lives here.
 */
function parseValue(raw: string, valueType: string): number | string | boolean | null {
  if (valueType === 'BOOLEAN') return raw === 'yes';
  if (valueType !== 'NUMERIC') return raw;

  const numeric = Number(raw.replace(',', '.'));

  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Whether a value would supersede its predecessor with the same reading.
 *
 * Without this, pressing „Weiter" a second time on an unchanged stage would
 * file a correction for every filled cell — a history of edits that never
 * happened (§13).
 */
function isUnchanged(existing: RecordedMeasurement, value: number | string | boolean): boolean {
  if (typeof value === 'boolean') return existing.booleanValue === value;
  if (typeof value === 'number') return Number(formatValue(existing)) === value;

  return existing.textValue === value;
}
