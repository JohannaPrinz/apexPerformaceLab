'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Badge, Button } from '@apex/ui';

import { TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { SIDE_LABELS_DE } from '../../components/labels';
import { correctMeasurementAction, recordMeasurementAction } from '../server/actions';

import { findRecorded, formatValue, type MeasurementSlot, type RecordedMeasurement } from './slots';

/**
 * One expected value.
 *
 * The input type follows the measurement type's `valueType`, so the same
 * component records a lactate reading, a movement-quality note and a
 * pass/fail — there is no branch per test anywhere in this screen.
 *
 * **An existing value is corrected, never edited.** Saving over one creates a
 * new reading that supersedes it (§4, §13); the button says so, and the old
 * value stays visible in the history below the grid.
 */
export function MeasurementCell({
  slot,
  passIndex,
  moduleId,
  measurements,
  type,
  readOnly,
}: {
  slot: MeasurementSlot;
  passIndex: number | null;
  moduleId: string;
  measurements: readonly RecordedMeasurement[];
  type: { name: string; unit: string; valueType: string } | undefined;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [note, setNote] = useState('');
  const [openContext, setOpenContext] = useState<Record<string, string>>({});

  const existing = findRecorded(measurements, slot, passIndex);
  const valueType = type?.valueType ?? 'NUMERIC';

  const currentValue = existing ? formatValue(existing) : '';

  function parse(raw: string): number | string | boolean | null {
    if (valueType === 'NUMERIC') {
      const parsed = Number(raw.replace(',', '.'));

      return raw.trim() !== '' && Number.isFinite(parsed) ? parsed : null;
    }
    if (valueType === 'BOOLEAN') return raw === 'yes' ? true : raw === 'no' ? false : null;

    return raw.trim() === '' ? null : raw;
  }

  function save() {
    const value = parse(draft);
    if (value === null) {
      setError('Bitte einen Wert eingeben.');

      return;
    }

    setError(null);
    startTransition(async () => {
      const result = existing
        ? await correctMeasurementAction({
            measurementId: existing.id,
            value,
            note: note.trim() === '' ? null : note.trim(),
            slotKey: slot.key,
          })
        : await recordMeasurementAction({
            moduleId,
            measurementTypeId: slot.measurementTypeId,
            value,
            side: slot.side,
            passIndex,
            context:
              Object.keys({ ...slot.context, ...openContext }).length > 0
                ? { ...slot.context, ...openContext }
                : null,
            note: note.trim() === '' ? null : note.trim(),
            slotKey: slot.key,
          });

      if (result.message) setError(result.message);
      else {
        setDraft('');
        setNote('');
        router.refresh();
      }
    });
  }

  return (
    <div
      // `min-w-0`: a grid item carries `min-width: auto`, so the longest
      // measurement name would size the whole track instead of wrapping
      // inside it. Measured at 375px: each cell was the full viewport wide
      // and pushed the page 24px sideways.
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-card p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-sm font-medium break-words">
          {type?.name ?? 'Unbekannte Messgröße'}
          {type ? <span className="text-muted-foreground"> · {type.unit}</span> : null}
        </span>

        <div className="flex items-center gap-1.5">
          {slot.side !== 'BILATERAL' ? (
            <Badge variant="outline">{SIDE_LABELS_DE[slot.side] ?? slot.side}</Badge>
          ) : null}
          {Object.entries(slot.context).map(([key, value]) => (
            <Badge key={key} variant="secondary">
              {value}
            </Badge>
          ))}
        </div>
      </div>

      {existing ? (
        <p className="text-sm">
          <span className="font-medium" data-numeric>
            {currentValue}
          </span>
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
              value={openContext[dimension.key] ?? ''}
              onChange={(event) =>
                setOpenContext((previous) => ({
                  ...previous,
                  [dimension.key]: event.target.value,
                }))
              }
              placeholder={dimension.label}
              aria-label={dimension.label}
              className={`${TOUCH_FIELD} rounded-md border border-input bg-background px-3`}
            />
          ))}

          <div className="flex gap-2">
            {valueType === 'BOOLEAN' ? (
              <select
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label="Wert"
                className={`${TOUCH_FIELD} flex-1 rounded-md border border-input bg-background px-3`}
              >
                <option value="">—</option>
                <option value="yes">Ja</option>
                <option value="no">Nein</option>
              </select>
            ) : (
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                inputMode={valueType === 'NUMERIC' ? 'decimal' : 'text'}
                placeholder={existing ? 'Korrigierter Wert' : 'Wert'}
                aria-label="Wert"
                // `min-w-0`: a flex child defaults to `min-width: auto`, so a
                // long placeholder would push the Save button off the card
                // rather than shrinking.
                className={`${TOUCH_FIELD} min-w-0 flex-1 rounded-md border border-input bg-background px-3`}
              />
            )}

            <Button
              className={TOUCH_BUTTON}
              variant={existing ? 'outline' : 'accent'}
              disabled={pending}
              onClick={save}
            >
              {pending ? '…' : existing ? 'Korrigieren' : 'Speichern'}
            </Button>
          </div>

          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Notiz zu diesem Wert (optional)"
            aria-label="Notiz zu diesem Wert"
            className={`${TOUCH_FIELD} rounded-md border border-input bg-background px-3`}
          />
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
