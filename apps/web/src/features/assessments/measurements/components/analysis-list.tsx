import { contextOf } from '@apex/domain';

/**
 * The analyses a test holds, newest first.
 *
 * ## Why grouping by instant works
 *
 * Every value one analysis produced is written with the **same `capturedAt`**,
 * and each carries the coach's purpose as its remark. So "the analyses in this
 * test" is a grouping, not a new object: no table, no status, no lifecycle to
 * keep in step with anything. The alternative — a pass per analysis — would have
 * made every test permanently incomplete and split one athlete's knee range
 * into a fresh series per session.
 *
 * ## What it shows and what it does not
 *
 * The measured ranges, per joint and side, with the date and the purpose. No
 * verdict, no comparison against a norm, and no arrow saying "better": the
 * platform ships no reference ranges, so a direction would be an opinion.
 * Two analyses beside each other let a coach read the difference themselves,
 * which is the honest version of the same help.
 */

const NUMBER = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const JOINT_LABELS: Readonly<Record<string, string>> = {
  knee: 'Knie',
  hip: 'Hüfte',
  Knie: 'Knie',
  Hüfte: 'Hüfte',
};

const SIDE_LABELS: Readonly<Record<string, string>> = {
  LEFT: 'links',
  RIGHT: 'rechts',
  BILATERAL: 'beidseitig',
};

/** The shape the overview already holds. Only what this needs is named. */
export interface AnalysisMeasurement {
  readonly id: string;
  readonly measurementTypeId: string;
  readonly side: string;
  readonly numericValue: unknown;
  readonly context: unknown;
  /**
   * Optional because the shape this reads is the entry screen's, and that screen
   * does not need either field. A row without them is not an analysis reading
   * and is skipped rather than guessed at.
   */
  readonly capturedAt?: Date | undefined;
  readonly source?: string | undefined;
  readonly note: string | null;
}

interface AnalysisGroup {
  readonly key: string;
  readonly capturedAt: Date;
  readonly purpose: string | null;
  readonly readings: readonly {
    readonly id: string;
    readonly joint: string | null;
    readonly side: string;
    readonly value: number | null;
    readonly unit: string;
  }[];
}

/**
 * Groups the derived rows into the analyses they came from.
 *
 * Exported so it can be tested without a screen: the grouping is the part that
 * would silently merge two analyses recorded in the same second, or split one.
 */
export function groupAnalyses(
  measurements: readonly AnalysisMeasurement[],
  unitFor: (measurementTypeId: string) => string,
): readonly AnalysisGroup[] {
  const byInstant = new Map<string, AnalysisMeasurement[]>();

  for (const row of measurements) {
    // Only computed rows. A value a coach typed into this test by hand is a
    // measurement, but it is not an analysis and must not appear as one.
    if (row.source !== 'DERIVED' || row.capturedAt === undefined) continue;

    const key = row.capturedAt.toISOString();
    const found = byInstant.get(key);

    if (found) found.push(row);
    else byInstant.set(key, [row]);
  }

  return [...byInstant.entries()]
    .map(([key, rows]) => ({
      key,
      capturedAt: rows[0]!.capturedAt!,
      // Every row of one analysis carries the same remark; the first that has
      // one names the group.
      purpose: rows.find((row) => (row.note ?? '') !== '')?.note ?? null,
      readings: rows
        .map((row) => {
          const context = contextOf(row.context);

          return {
            id: row.id,
            joint: context['joint'] ?? context['gelenk'] ?? null,
            side: row.side,
            value: row.numericValue === null ? null : Number(row.numericValue),
            unit: unitFor(row.measurementTypeId),
          };
        })
        .sort(
          (a, b) => (a.joint ?? '').localeCompare(b.joint ?? '') || a.side.localeCompare(b.side),
        ),
    }))
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
}

export function AnalysisList({
  measurements,
  units,
}: {
  readonly measurements: readonly AnalysisMeasurement[];
  /** Measurement type id → unit, from the workspace. */
  readonly units: Readonly<Record<string, string>>;
}) {
  const groups = groupAnalyses(measurements, (id) => units[id] ?? '');

  if (groups.length === 0) return null;

  return (
    <section aria-label="Videoanalysen" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Videoanalysen</h2>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          {groups.length === 1
            ? 'Eine Analyse in diesem Test.'
            : `${String(groups.length)} Analysen in diesem Test, neueste zuerst.`}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <li key={group.key} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="min-w-0 text-sm font-medium break-words">
                {group.purpose ?? 'Videoanalyse'}
              </span>
              <span className="shrink-0 text-sm text-muted-foreground" data-numeric>
                {DATE.format(group.capturedAt)}
              </span>
            </div>

            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
              {group.readings.map((reading) => (
                <div key={reading.id} className="contents">
                  <dt className="text-muted-foreground">
                    {reading.joint === null
                      ? 'Bewegungsumfang'
                      : (JOINT_LABELS[reading.joint] ?? reading.joint)}{' '}
                    {SIDE_LABELS[reading.side] ?? reading.side}
                  </dt>
                  <dd data-numeric>
                    {reading.value === null
                      ? '—'
                      : `${NUMBER.format(reading.value)}${reading.unit}`}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
