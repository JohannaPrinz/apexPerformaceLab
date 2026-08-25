'use client';

import { useState } from 'react';

import { MODULE_STATUS_LABELS_DE, SIDE_LABELS_DE } from '../../components/labels';

/**
 * The stages of a test as a curve, with earlier tests of the type beside it.
 *
 * ## The x axis is a choice, not an assumption
 *
 * Stage 3 of one test and stage 3 of another are the same *position*, not the
 * same demand: a coach who moved the protocol from 10 to 11 km/h has not made
 * the athlete faster. The model records no field for what a stage demanded —
 * the load of a stage is itself one of the quantities measured at that stage —
 * and nothing marks which quantity that is. So the axis defaults to the stage
 * sequence, says so in as many words, and offers every quantity the tests
 * actually recorded as an alternative. Nothing is guessed.
 *
 * ## What it never draws
 *
 * No average of two tests, and no line through points of different tests. Each
 * test is one curve, named in the legend, and the one being looked at is drawn
 * heavier (§11).
 *
 * ## Colour is never the only signal
 *
 * Every curve carries a marker shape as well as a colour, and the legend
 * repeats both — the design system's rule for the series palette.
 *
 * ## The picture is not the record
 *
 * The table above holds the same numbers and is what a screen reader reads;
 * this carries `role="img"` and one summarising label. A diagram that were the
 * only way to the values would put them out of reach.
 */
export function MeasurementChart({ groups }: { readonly groups: readonly ChartGroupView[] }) {
  if (groups.length === 0) return null;

  return (
    <section aria-label="Belastungsdiagramme" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Diagramm</h2>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          Die Stufen eines Tests als Kurve. Jeder Test bleibt eine eigene Kurve — es wird nichts zu
          einem Mittel zusammengefasst.
        </p>
      </div>

      {groups.map((group) => (
        <ChartCard key={group.key} group={group} />
      ))}
    </section>
  );
}

function ChartCard({ group }: { readonly group: ChartGroupView }) {
  /**
   * Which quantity the x axis shows. `null` is the stage sequence.
   *
   * Starts on whatever the protocol declared as the demand of a stage, and
   * falls back to the sequence where it declared none. A step test then opens
   * on speed rather than on stage numbers, which is the axis the curves are
   * actually comparable on.
   *
   * Local, not in the URL: it is a way of looking at one diagram, not a filter
   * that decides what the page is about, and a coach comparing two axes should
   * not be pushing history entries.
   */
  const [loadTypeId, setLoadTypeId] = useState<string | null>(group.defaultLoadId);

  const load = group.loadCandidates.find((candidate) => candidate.id === loadTypeId) ?? null;

  const qualifier = [
    group.side === 'BILATERAL' ? null : (SIDE_LABELS_DE[group.side] ?? group.side),
    group.exerciseName,
    ...Object.values(group.context),
  ].filter((part) => part !== null && part !== '');

  const title =
    qualifier.length === 0 ? group.typeName : `${group.typeName} · ${qualifier.join(' · ')}`;

  // Drawn in reverse of the legend order, so the test being looked at sits on
  // top of the others.
  const series = [...group.series].sort(
    (a, b) => Number(a.isCurrentModule) - Number(b.isCurrentModule),
  );

  const xOf = (point: ChartPointView) =>
    load === null ? (point.passIndex ?? 1) : (point.loads[load.id] ?? 0);

  const points = series.flatMap((entry) =>
    entry.points.map((point) => ({ x: xOf(point), y: point.y })),
  );

  if (points.length === 0) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const bounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <h3 className="min-w-0 text-sm font-medium text-pretty">
          {title}
          <span className="text-muted-foreground"> · {group.unit}</span>
        </h3>

        {group.loadCandidates.length === 0 ? null : (
          <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            x-Achse
            <select
              value={loadTypeId ?? ''}
              onChange={(event) => {
                setLoadTypeId(event.target.value === '' ? null : event.target.value);
              }}
              className="h-11 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:h-9"
            >
              <option value="">Stufenfolge</option>
              {group.loadCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({candidate.unit})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* The sentence that keeps the picture honest. Without a load quantity the
          axis is a sequence, and two tests sharing a position on it need not
          have shared a demand. */}
      <p className="text-xs text-pretty text-muted-foreground">
        {load === null
          ? 'x-Achse: Stufenfolge. Sie zeigt die Reihenfolge der Stufen, nicht dieselbe Belastung — Stufe 3 zweier Tests kann unterschiedlich belastet gewesen sein.'
          : `x-Achse: ${load.name} in ${load.unit}. Punkte auf derselben x-Position wurden bei derselben Belastung erfasst.`}
      </p>

      <Plot
        series={series}
        xOf={xOf}
        bounds={bounds}
        label={`${title} in ${group.unit}. ${String(series.length)} ${series.length === 1 ? 'Test' : 'Tests'}. x-Achse: ${load === null ? 'Stufenfolge' : `${load.name} in ${load.unit}`}. Die Werte stehen in der Tabelle darüber.`}
      />

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {[...series].reverse().map((entry, index) => (
          <li key={entry.moduleId} className="flex items-center gap-1.5 text-xs">
            <span aria-hidden="true" className={markerClass(series.length - 1 - index)} />
            <span className="min-w-0 break-words">
              {entry.moduleName ?? '—'}
              {entry.isCurrentModule ? (
                <span className="text-muted-foreground"> · dieser Test</span>
              ) : null}
              <span className="text-muted-foreground">
                {' · '}
                {MODULE_STATUS_LABELS_DE[
                  entry.moduleStatus as keyof typeof MODULE_STATUS_LABELS_DE
                ] ?? entry.moduleStatus}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The plot: geometry in SVG, everything readable in HTML.
 *
 * Text inside a scaled `viewBox` scales with it — measured at 6px on a 375px
 * screen and 19px on a desktop, from one 10px declaration. So only the lines
 * live in the SVG, stretched by `preserveAspectRatio="none"` with a
 * non-scaling stroke, and the labels and markers are ordinary elements placed
 * in percent. They are then the size the design system says, at every width.
 */
function Plot({
  series,
  xOf,
  bounds,
  label,
}: {
  readonly series: readonly ChartSeriesView[];
  readonly xOf: (point: ChartPointView) => number;
  readonly bounds: { minX: number; maxX: number; minY: number; maxY: number };
  readonly label: string;
}) {
  // A flat series would divide by zero; a band around the value keeps it
  // readable without pretending at a spread it does not have.
  const spanX = bounds.maxX - bounds.minX || 1;
  const padY = (bounds.maxY - bounds.minY) * 0.1 || Math.abs(bounds.maxY) * 0.1 || 1;
  const minY = bounds.minY - padY;
  const spanY = bounds.maxY + padY - minY || 1;

  const atX = (value: number) => ((value - bounds.minX) / spanX) * 100;
  const atY = (value: number) => 100 - ((value - minY) / spanY) * 100;

  const xTicks = ticksOf(bounds.minX, bounds.maxX);
  const yTicks = ticksOf(minY, minY + spanY);

  return (
    <div role="img" aria-label={label} className="relative h-52 w-full sm:h-60">
      {/* The y scale sits outside the plot, so its width is the label's rather
          than the drawing's. */}
      <div className="absolute top-0 bottom-6 left-0 w-10">
        {yTicks.map((tick) => (
          <span
            key={`y${String(tick)}`}
            style={{ top: `${String(atY(tick))}%` }}
            className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
          >
            {formatTick(tick)}
          </span>
        ))}
      </div>

      <div className="absolute top-0 right-0 bottom-6 left-10">
        {yTicks.map((tick) => (
          <div
            key={`g${String(tick)}`}
            style={{ top: `${String(atY(tick))}%` }}
            className="absolute inset-x-0 border-t border-border"
          />
        ))}

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-0 size-full overflow-visible"
        >
          {series.map((entry, index) => {
            const drawn = entry.points
              .map((point) => ({ x: atX(xOf(point)), y: atY(point.y) }))
              .sort((a, b) => a.x - b.x);

            if (drawn.length < 2) return null;

            return (
              <polyline
                key={entry.moduleId}
                points={drawn.map((p) => `${String(p.x)},${String(p.y)}`).join(' ')}
                fill="none"
                strokeWidth={entry.isCurrentModule ? 2.5 : 1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className={strokeOf(index)}
              />
            );
          })}
        </svg>

        {series.map((entry, index) =>
          entry.points.map((point) => (
            <span
              key={`${entry.moduleId}-${String(point.passIndex)}-${String(point.y)}`}
              style={{ left: `${String(atX(xOf(point)))}%`, top: `${String(atY(point.y))}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 ${markerClass(index)}`}
            />
          )),
        )}
      </div>

      <div className="absolute right-0 bottom-0 left-10 h-6">
        {xTicks.map((tick) => (
          <span
            key={`x${String(tick)}`}
            style={{ left: `${String(atX(tick))}%` }}
            className="absolute top-1 -translate-x-1/2 text-[10px] text-muted-foreground tabular-nums"
          >
            {formatTick(tick)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A shape per series, so the curves stay apart without colour.
 *
 * The design system is explicit that colour never carries meaning alone; a
 * printed report and a coach with a colour-vision deficiency both need this.
 */
function markerClass(index: number): string {
  const shape =
    [
      'size-2 rounded-full',
      'size-2',
      'size-2 rotate-45',
      'size-2 [clip-path:polygon(50%_0,100%_100%,0_100%)]',
      'size-2.5 rounded-full border-2 bg-transparent',
    ][index % 5] ?? '';

  return `block shrink-0 ${shape} ${paletteOf(index)}`;
}

/** The design system's contrast-checked series palette, cycled. */
function paletteOf(index: number): string {
  return (
    [
      'bg-chart-1 border-chart-1',
      'bg-chart-2 border-chart-2',
      'bg-chart-3 border-chart-3',
      'bg-chart-4 border-chart-4',
      'bg-chart-5 border-chart-5',
    ][index % 5] ?? ''
  );
}

function strokeOf(index: number): string {
  return (
    ['stroke-chart-1', 'stroke-chart-2', 'stroke-chart-3', 'stroke-chart-4', 'stroke-chart-5'][
      index % 5
    ] ?? ''
  );
}

/** Four gridlines across the range. */
function ticksOf(min: number, max: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];

  return [0, 1, 2, 3].map((index) => min + (span / 3) * index);
}

function formatTick(value: number): string {
  const rounded = Math.round(value * 100) / 100;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** The shape the overview passes down. */
export interface ChartPointView {
  readonly passIndex: number | null;
  readonly y: number;
  readonly loads: Record<string, number>;
}

export interface ChartSeriesView {
  readonly moduleId: string;
  readonly moduleName: string | null;
  readonly moduleStatus: string;
  readonly isCurrentModule: boolean;
  readonly points: readonly ChartPointView[];
}

export interface ChartGroupView {
  readonly key: string;
  /** What the protocol named as the demand of a stage, when it named one. */
  readonly defaultLoadId: string | null;
  readonly typeName: string;
  readonly unit: string;
  readonly side: string;
  readonly exerciseName: string | null;
  readonly context: Record<string, string>;
  readonly loadCandidates: readonly { id: string; name: string; unit: string }[];
  readonly series: readonly ChartSeriesView[];
}
