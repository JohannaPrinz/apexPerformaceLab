'use client';

import { Badge } from '@apex/ui';

import { FOCUS_RING, TOUCH_FIELD } from '@/components/common/touch';

import { SIDE_LABELS_DE } from '../../components/labels';

import { findRecorded, formatValue, type MeasurementSlot, type RecordedMeasurement } from './slots';

/**
 * Everything one cell can hold before the stage is saved.
 *
 * **No note.** A remark per value gave a stage of eight values eight further
 * fields, and what a coach actually wants to record — „Athlet klagte über
 * Schmerzen" — is about the stage, not about one reading. The note moved up to
 * the stage; `Measurement.note` stays in the model, because an import can carry
 * a remark that genuinely belongs to a single reading.
 */
export interface SlotDraft {
  readonly value: string;
  /** Values for dimensions the coach names as they go — a site, a position. */
  readonly context: Record<string, string>;
}

export const EMPTY_DRAFT: SlotDraft = { value: '', context: {} };

/**
 * One expected value.
 *
 * The input type follows the measurement type's `valueType`, so the same
 * component records a lactate reading, a movement-quality note and a
 * pass/fail — there is no branch per test anywhere in this screen.
 *
 * ## It no longer saves
 *
 * The cell used to own its draft and its own Save button, which made a stage of
 * five values five separate writes and gave the coach five buttons to find. The
 * draft now belongs to the runner, which submits the stage in one call — so
 * this is a controlled input and nothing more.
 *
 * **An existing value is still corrected, never edited.** Typing over one and
 * pressing „Weiter" files a reading that supersedes it (§4, §13); the field says
 * so, and the old value stays visible in the history below the grid.
 */
export function MeasurementCell({
  slot,
  passIndex,
  measurements,
  type,
  draft,
  onChange,
  error,
  readOnly,
}: {
  slot: MeasurementSlot;
  passIndex: number | null;
  measurements: readonly RecordedMeasurement[];
  type: { name: string; unit: string; valueType: string } | undefined;
  /** This cell's draft, owned by the runner. */
  draft: SlotDraft;
  onChange: (patch: Partial<SlotDraft>) => void;
  /** Set when the last save refused this particular value. */
  error?: string | undefined;
  readOnly: boolean;
}) {
  const existing = findRecorded(measurements, slot, passIndex);
  const corrected = existing?.supersedes != null;
  const valueType = type?.valueType ?? 'NUMERIC';
  const name = type?.name ?? 'Unbekannte Messgröße';
  const fieldId = `slot-${slot.key}`;
  const errorId = `${fieldId}-error`;

  // The measurement name alone is ambiguous once a test records both sides or
  // several sites: three fields called "Laktat" tell a screen-reader user
  // nothing. The coordinates the cell already displays go into the name too.
  const qualifier = [
    slot.side === 'BILATERAL' ? null : (SIDE_LABELS_DE[slot.side] ?? slot.side),
    ...Object.values(slot.context),
  ].filter((part) => part !== null);
  const accessibleName = qualifier.length > 0 ? `${name} · ${qualifier.join(' · ')}` : name;

  const field = `${TOUCH_FIELD} ${FOCUS_RING} w-full min-w-0 rounded-md border border-input bg-background px-3 aria-invalid:border-destructive`;

  return (
    <div
      // `min-w-0`: a grid item carries `min-width: auto`, so the longest
      // measurement name would size the whole track instead of wrapping inside
      // it. Measured at 375px: each cell was the full viewport wide and pushed
      // the page 24px sideways.
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-card p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={fieldId} className="min-w-0 text-sm font-medium break-words">
          {name}
          {type ? <span className="text-muted-foreground"> · {type.unit}</span> : null}
        </label>

        <div className="flex items-center gap-1.5">
          {slot.side === 'BILATERAL' ? null : (
            <Badge variant="outline">{SIDE_LABELS_DE[slot.side] ?? slot.side}</Badge>
          )}
          {Object.entries(slot.context).map(([key, contextValue]) => (
            <Badge key={key} variant="secondary">
              {contextValue}
            </Badge>
          ))}
        </div>
      </div>

      {existing ? (
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          {/* A corrected reading is marked, not merely replaced. The value that
              was superseded is never deleted (§13) but does not belong on the
              entry grid — what a coach needs here is that *this* number was
              changed after the fact. */}
          <span
            className={`font-medium ${corrected ? 'rounded bg-accent-soft px-1.5 py-0.5 text-accent-soft-foreground' : ''}`}
            data-numeric
          >
            {formatValue(existing)}
          </span>
          {corrected ? (
            <span className="text-xs text-accent-soft-foreground">korrigiert</span>
          ) : null}
          {existing.note ? <span className="text-muted-foreground"> · {existing.note}</span> : null}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Noch nicht erfasst</p>
      )}

      {readOnly ? null : (
        <div className="flex flex-col gap-2">
          {slot.openDimensions.map((dimension) => (
            <input
              key={dimension.key}
              value={draft.context[dimension.key] ?? ''}
              onChange={(event) => {
                onChange({ context: { ...draft.context, [dimension.key]: event.target.value } });
              }}
              placeholder={dimension.label}
              aria-label={`${dimension.label} · ${accessibleName}`}
              className={field}
            />
          ))}

          {valueType === 'BOOLEAN' ? (
            <select
              id={fieldId}
              value={draft.value}
              onChange={(event) => {
                onChange({ value: event.target.value });
              }}
              aria-label={accessibleName}
              aria-invalid={error === undefined ? undefined : true}
              aria-describedby={error === undefined ? undefined : errorId}
              className={field}
            >
              <option value="">—</option>
              <option value="yes">Ja</option>
              <option value="no">Nein</option>
            </select>
          ) : (
            <input
              id={fieldId}
              value={draft.value}
              onChange={(event) => {
                onChange({ value: event.target.value });
              }}
              inputMode={valueType === 'NUMERIC' ? 'decimal' : 'text'}
              placeholder={existing ? 'Korrigierter Wert' : 'Wert'}
              aria-label={accessibleName}
              aria-invalid={error === undefined ? undefined : true}
              aria-describedby={error === undefined ? undefined : errorId}
              className={field}
            />
          )}

          {error === undefined ? null : (
            <p id={errorId} role="alert" className="text-xs text-pretty text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
