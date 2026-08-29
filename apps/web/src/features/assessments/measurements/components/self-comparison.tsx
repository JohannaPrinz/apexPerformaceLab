import type { TestProtocol } from '@apex/domain';
import { Badge } from '@apex/ui';

import { SIDE_LABELS_DE } from '../../components/labels';

/**
 * The same test, earlier.
 *
 * ## What it says and what it will not say
 *
 * Current value, the last comparable one, the signed difference between them,
 * and the extremes of the series with their dates. **No adjective anywhere** —
 * not "besser", not "verbessert", not an arrow. A difference is arithmetic; what
 * it means is the coach's to write.
 *
 * A "Bestwert" appears only where the test's protocol declares which end of the
 * scale is the aim. Without that declaration the two extremes are shown as what
 * they are, because the highest duration is the best one in a hold and the worst
 * one in a time trial, and nothing in the data says which this is.
 *
 * ## Why the excluded tests are named
 *
 * "There is no previous value" and "there is one, taken under different
 * conditions" are different statements. The second is the one that tells a coach
 * what to change so the next test does compare.
 */

const NUMBER = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** A signed number, because a difference without its sign says nothing. */
function signed(value: number): string {
  if (value === 0) return '±0';

  return `${value > 0 ? '+' : '−'}${NUMBER.format(Math.abs(value))}`;
}

const withUnit = (value: number, unit: string) =>
  unit.trim() === '' ? NUMBER.format(value) : `${NUMBER.format(value)} ${unit}`;

export interface SelfComparisonPoint {
  readonly value: number;
  readonly capturedAt: Date;
}

export interface SelfComparisonRowView {
  readonly key: string;
  readonly typeName: string;
  readonly unit: string;
  readonly side: string;
  readonly exerciseName: string | null;
  readonly passIndex: number | null;
  readonly context: Record<string, string>;
  readonly current: SelfComparisonPoint;
  readonly previous: SelfComparisonPoint | null;
  readonly difference: number | null;
  readonly highest: SelfComparisonPoint;
  readonly lowest: SelfComparisonPoint;
  readonly best: SelfComparisonPoint | null;
  readonly count: number;
}

export interface SelfComparisonView {
  readonly protocol: TestProtocol | null;
  readonly direction: 'lower' | 'higher' | null;
  readonly rows: readonly SelfComparisonRowView[];
  readonly mismatchedProtocols: readonly {
    moduleId: string;
    moduleName: string | null;
    protocolName: string | null;
  }[];
}

/** The coordinates of a row, in the order the entry grid names them. */
function qualifierOf(row: SelfComparisonRowView): string {
  return [
    row.exerciseName,
    row.side === 'BILATERAL' ? null : (SIDE_LABELS_DE[row.side] ?? row.side),
    row.passIndex === null ? null : `Stufe ${String(row.passIndex)}`,
    ...Object.values(row.context),
  ]
    .filter((part) => part !== null && part !== '')
    .join(' · ');
}

export function SelfComparison({ comparison }: { readonly comparison: SelfComparisonView }) {
  const { protocol, rows, mismatchedProtocols } = comparison;

  if (rows.length === 0) return null;

  const repeated = rows.filter((row) => row.previous !== null).length;

  return (
    <section aria-labelledby="self-comparison" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="self-comparison" className="text-sm font-medium">
          Vergleich mit früheren Tests
        </h2>
        <p className="max-w-prose text-xs text-pretty text-muted-foreground">
          Verglichen wird nur, was dieselbe Messgröße an derselben Stelle unter denselben
          Bedingungen erfasst hat. Die Differenz ist eine Zahl mit Vorzeichen — ob sie in die
          gewünschte Richtung zeigt, steht hier nicht.
        </p>
      </div>

      {/* The conditions, stated outright: they are what makes the rows below
          comparable, and a coach cannot check that against something invisible. */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {protocol === null ? (
          <span className="text-muted-foreground">
            Für diesen Test sind keine Bedingungen hinterlegt. Verglichen wird mit Tests, für die
            ebenfalls keine hinterlegt sind.
          </span>
        ) : (
          <>
            <Badge variant="secondary">{protocol.label ?? protocol.key}</Badge>
            {protocol.distanceM === undefined ? null : (
              <Badge variant="outline">
                <span data-numeric>{NUMBER.format(protocol.distanceM)} m</span>
              </Badge>
            )}
            {protocol.division === undefined ? null : (
              <Badge variant="outline">{protocol.division}</Badge>
            )}
            {protocol.device === undefined ? null : (
              <Badge variant="outline">{protocol.device}</Badge>
            )}
            {protocol.venue === undefined ? null : (
              <Badge variant="outline">{protocol.venue}</Badge>
            )}
          </>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-3 font-medium">Messgröße</th>
              <th className="py-2 pr-3 font-medium">Aktuell</th>
              <th className="py-2 pr-3 font-medium">Zuletzt vergleichbar</th>
              <th className="py-2 pr-3 font-medium">Differenz</th>
              {/* "der Serie", because it is one: reading an older test shows the
                  best value of the whole series, which may well come from a
                  later test than the one being read. A browser run made that
                  visible — 289 s current beside a best of 278 s — and the header
                  is where it has to be said. */}
              <th className="py-2 pr-3 font-medium">
                {comparison.direction === null
                  ? 'Höchster / niedrigster Wert der Serie'
                  : 'Bestwert der Serie'}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const qualifier = qualifierOf(row);

              return (
                <tr key={row.key} className="border-b border-border align-top last:border-0">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{row.typeName}</span>
                    {qualifier === '' ? null : (
                      <span className="block text-xs text-muted-foreground">{qualifier}</span>
                    )}
                  </td>

                  <td className="py-2 pr-3" data-numeric>
                    {withUnit(row.current.value, row.unit)}
                    <span className="block text-xs text-muted-foreground">
                      {DATE.format(row.current.capturedAt)}
                    </span>
                  </td>

                  <td className="py-2 pr-3">
                    {row.previous === null ? (
                      <span className="text-xs text-muted-foreground">Erster Test dieser Art</span>
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
                      /* Deliberately not coloured. Green and red are a verdict,
                         and no direction has been declared for most tests. */
                      <span>
                        {signed(row.difference)}
                        {row.unit.trim() === '' ? '' : ` ${row.unit}`}
                      </span>
                    )}
                  </td>

                  <td className="py-2 pr-3">
                    {row.best !== null ? (
                      <>
                        <span data-numeric>{withUnit(row.best.value, row.unit)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {DATE.format(row.best.capturedAt)}
                        </span>
                      </>
                    ) : (
                      <span className="flex flex-col gap-0.5 text-xs">
                        <span data-numeric>
                          ↑ {withUnit(row.highest.value, row.unit)} ·{' '}
                          {DATE.format(row.highest.capturedAt)}
                        </span>
                        <span data-numeric>
                          ↓ {withUnit(row.lowest.value, row.unit)} ·{' '}
                          {DATE.format(row.lowest.capturedAt)}
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground" data-numeric>
        {repeated} von {rows.length} Werten haben einen früheren Vergleichswert.
        {comparison.direction === null
          ? ' Für einen Bestwert fehlt die Angabe, welche Richtung angestrebt wird.'
          : ''}
      </p>

      {mismatchedProtocols.length === 0 ? null : (
        <p className="rounded-md border border-border px-3 py-2 text-xs text-pretty text-muted-foreground">
          {mismatchedProtocols.length === 1
            ? 'Ein früherer Test dieser Art wurde unter anderen Bedingungen durchgeführt und daher nicht herangezogen'
            : `${String(mismatchedProtocols.length)} frühere Tests dieser Art wurden unter anderen Bedingungen durchgeführt und daher nicht herangezogen`}
          : {mismatchedProtocols.map((entry) => entry.protocolName ?? 'ohne Angabe').join(', ')}.
        </p>
      )}
    </section>
  );
}
