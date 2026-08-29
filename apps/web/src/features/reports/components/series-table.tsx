'use client';

import { SIDE_LABELS_DE } from '@/features/assessments/components/labels';

/**
 * What one test measured, one row per series.
 *
 * ## A series is not a measurement type
 *
 * "Last" is a measurement type. "Last, Kniebeuge" and "Last, Bankdrücken" are two
 * series, and putting them in one row as "60 bis 120 kg" loses the only thing
 * that made either number readable. The coordinates — side, exercise, stage,
 * context — are therefore part of the row's name, not decoration on it.
 *
 * ## Two columns, and nothing between them
 *
 * What was measured, and what the same series said before. The difference is a
 * signed number in the measurement's own unit and carries no adjective and no
 * colour: nothing in the record says which direction is wanted, unless the coach
 * has said so for this test — and then it appears as a best value, not as a
 * verdict on the change.
 */

const NUMBER = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});

/** How a value came about, where it is worth saying. */
const SOURCE_LABELS: Readonly<Record<string, string>> = {
  DERIVED: 'berechnet',
  DEVICE: 'Gerät',
  IMPORT: 'Import',
};

function signed(value: number): string {
  if (value === 0) return '±0';

  return `${value > 0 ? '+' : '−'}${NUMBER.format(Math.abs(value))}`;
}

const withUnit = (value: number, unit: string) =>
  unit.trim() === '' ? NUMBER.format(value) : `${NUMBER.format(value)} ${unit}`;

export interface SeriesRow {
  readonly key: string;
  readonly typeName: string;
  readonly unit: string;
  readonly side: string;
  readonly exerciseName: string | null;
  readonly passIndex: number | null;
  readonly context: Record<string, string>;
  readonly source: string;
  readonly current: { value: number; capturedAt: Date };
  readonly previous: { value: number; capturedAt: Date } | null;
  readonly difference: number | null;
  readonly highest: { value: number; capturedAt: Date };
  readonly lowest: { value: number; capturedAt: Date };
  readonly best: { value: number; capturedAt: Date } | null;
  readonly count: number;
}

/** The coordinates, in the order the entry grid names them. */
export function seriesLabel(row: SeriesRow): string {
  return [
    row.exerciseName,
    row.side === 'BILATERAL' ? null : (SIDE_LABELS_DE[row.side] ?? row.side),
    row.passIndex === null ? null : `Stufe ${String(row.passIndex)}`,
    ...Object.values(row.context),
  ]
    .filter((part) => part !== null && part !== '')
    .join(' · ');
}

export function SeriesTable({ rows }: { readonly rows: readonly SeriesRow[] }) {
  if (rows.length === 0) return null;

  const anyBest = rows.some((row) => row.best !== null);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[38rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-3 font-medium">Messgröße</th>
            <th className="py-2 pr-3 font-medium">Gemessen</th>
            <th className="py-2 pr-3 font-medium">Früher</th>
            <th className="py-2 pr-3 font-medium">Differenz</th>
            {anyBest ? <th className="py-2 pr-3 font-medium">Bestwert</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const label = seriesLabel(row);
            const source = SOURCE_LABELS[row.source];

            return (
              <tr key={row.key} className="border-b border-border align-top last:border-0">
                <td className="py-2 pr-3">
                  <span className="font-medium break-words">{row.typeName}</span>
                  {label === '' ? null : (
                    <span className="block text-xs break-words text-muted-foreground">{label}</span>
                  )}
                </td>

                <td className="py-2 pr-3" data-numeric>
                  {withUnit(row.current.value, row.unit)}
                  <span className="block text-xs text-muted-foreground">
                    {DATE.format(row.current.capturedAt)}
                    {source === undefined ? '' : ` · ${source}`}
                  </span>
                </td>

                <td className="py-2 pr-3">
                  {row.previous === null ? (
                    <span className="text-xs text-muted-foreground">erstmals gemessen</span>
                  ) : (
                    <>
                      <span data-numeric>{withUnit(row.previous.value, row.unit)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {DATE.format(row.previous.capturedAt)}
                      </span>
                    </>
                  )}
                </td>

                <td className="py-2 pr-3" data-numeric>
                  {row.difference === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    /* Deliberately uncoloured. Green and red are a verdict, and
                       for most quantities nothing says which way is wanted. */
                    <span>
                      {signed(row.difference)}
                      {row.unit.trim() === '' ? '' : ` ${row.unit}`}
                    </span>
                  )}
                </td>

                {anyBest ? (
                  <td className="py-2 pr-3">
                    {row.best === null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <>
                        <span data-numeric>{withUnit(row.best.value, row.unit)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {DATE.format(row.best.capturedAt)}
                        </span>
                      </>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
