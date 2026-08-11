'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Badge, Button } from '@apex/ui';

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
      setError('Enter a value.');

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
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {type?.name ?? 'Unknown measurement'}
          {type ? <span className="text-muted-foreground"> · {type.unit}</span> : null}
        </span>

        <div className="flex items-center gap-1.5">
          {slot.side !== 'BILATERAL' ? <Badge variant="outline">{slot.side}</Badge> : null}
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
        <p className="text-xs text-muted-foreground">Not recorded</p>
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
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            />
          ))}

          <div className="flex gap-2">
            {valueType === 'BOOLEAN' ? (
              <select
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label="Value"
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : (
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                inputMode={valueType === 'NUMERIC' ? 'decimal' : 'text'}
                placeholder={existing ? 'Corrected value' : 'Value'}
                aria-label="Value"
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              />
            )}

            <Button
              size="sm"
              variant={existing ? 'outline' : 'accent'}
              disabled={pending}
              onClick={save}
            >
              {pending ? '…' : existing ? 'Correct' : 'Save'}
            </Button>
          </div>

          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note about this value (optional)"
            aria-label="Note about this value"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
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
