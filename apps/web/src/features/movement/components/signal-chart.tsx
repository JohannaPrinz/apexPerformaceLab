import type { MovementRep, SignalPoint } from '@apex/domain';

/**
 * The angle repetitions are counted from, over the length of the recording.
 *
 * ## The picture is not the record
 *
 * The numbers are in the table beside it, which is what a screen reader reads.
 * This carries `role="img"` and one summarising label — a diagram that were the
 * only way to the values would put them out of reach.
 *
 * ## Colour is never the only signal
 *
 * The repetitions are marked by shaded bands **and** numbered, so the count is
 * readable without distinguishing the shading from the background.
 *
 * ## Gaps stay gaps
 *
 * Frames where the model saw nobody break the line rather than being bridged.
 * A straight segment across a gap would look exactly like an athlete holding
 * still, and that is the one thing the coach must be able to tell apart.
 */

const WIDTH = 720;
const HEIGHT = 200;
const PADDING = { top: 12, right: 12, bottom: 24, left: 34 };

export function SignalChart({
  signal,
  reps,
  durationMs,
}: {
  readonly signal: readonly SignalPoint[];
  readonly reps: readonly MovementRep[];
  readonly durationMs: number;
}) {
  if (signal.length === 0) return null;

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  // A fixed 0–180° scale rather than one fitted to the data: a squat read
  // against its own extremes looks identical whether it travelled 90° or 9°,
  // and the whole point of the picture is that difference.
  const x = (timeMs: number) => PADDING.left + (timeMs / Math.max(1, durationMs)) * plotWidth;
  const y = (angle: number) => PADDING.top + (1 - angle / 180) * plotHeight;

  /** Unbroken runs of readable frames. A gap ends a run. */
  const runs: SignalPoint[][] = [];
  let current: SignalPoint[] = [];

  for (const point of signal) {
    if (point.primary === null) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length > 0) runs.push(current);

  const label =
    `Der Winkel, aus dem gezählt wird, über die Länge der Aufnahme — ${String(reps.length)} ` +
    `${reps.length === 1 ? 'Wiederholung' : 'Wiederholungen'} markiert.`;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        className="h-auto w-full min-w-[20rem]"
      >
        {[0, 45, 90, 135, 180].map((angle) => (
          <g key={angle}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(angle)}
              y2={y(angle)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 6}
              y={y(angle) + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[9px]"
            >
              {angle}°
            </text>
          </g>
        ))}

        {reps.map((rep) => (
          <g key={rep.index}>
            <rect
              x={x(rep.startedAtMs)}
              y={PADDING.top}
              width={Math.max(1, x(rep.endedAtMs) - x(rep.startedAtMs))}
              height={plotHeight}
              className="fill-accent-soft"
              opacity={0.5}
            />
            <text
              x={(x(rep.startedAtMs) + x(rep.endedAtMs)) / 2}
              y={PADDING.top + 10}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {rep.index}
            </text>
          </g>
        ))}

        {runs.map((run, index) => (
          <polyline
            key={index}
            fill="none"
            strokeWidth={1.5}
            strokeLinejoin="round"
            className="stroke-[var(--chart-1)]"
            points={run
              .map((point) => `${String(x(point.timestampMs))},${String(y(point.primary ?? 0))}`)
              .join(' ')}
          />
        ))}

        <text x={PADDING.left} y={HEIGHT - 6} className="fill-muted-foreground text-[9px]">
          0 s
        </text>
        <text
          x={WIDTH - PADDING.right}
          y={HEIGHT - 6}
          textAnchor="end"
          className="fill-muted-foreground text-[9px]"
        >
          {(durationMs / 1000).toFixed(1).replace('.', ',')} s
        </text>
      </svg>
    </div>
  );
}
