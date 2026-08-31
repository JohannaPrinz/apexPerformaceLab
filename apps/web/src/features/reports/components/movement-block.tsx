import { Check, ImageOff, X } from 'lucide-react';

import { SignalChart } from '@/components/common/signal-chart';

import {
  angleTableOf,
  anglesOf,
  formatTarget,
  type DocumentTarget,
  type DocumentTest,
} from './document';

/**
 * A video analysis inside the assessment report.
 *
 * ## Why this is not a second analysis screen
 *
 * It draws the *same* curve the analysis screen drew, with the same component,
 * from the recording's own stored signal — one reading of one recording. The
 * angles come from the measurements the analysis produced, not from a parallel
 * copy, so a corrected value moves the table and the verdict together.
 *
 * ## Why the tempo is stated in degrees per second
 *
 * Because that is what a single camera supports. Power is force times velocity;
 * force needs a mass and velocity needs a scale in metres, and a phone video
 * provides neither. An angular velocity needs no calibration at all — it is
 * measured, in a unit, with a definition — so it is what appears here, under its
 * own name rather than under a word like "explosiveness" the recording cannot
 * back up.
 *
 * Nothing here is shown unless the recording produced it: a set too short to
 * time yields no tempo, and this renders no placeholder for it.
 */
const SECONDS = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const DEGREES = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

export function MovementBlock({
  test,
  choosing = false,
}: {
  readonly test: DocumentTest;
  /**
   * Whether a picker beside this block is offering stills to choose from.
   *
   * The absence then means "none chosen yet", not "none kept" — and the block
   * said the second while two pictures sat in the picker directly underneath.
   */
  readonly choosing?: boolean;
}) {
  const movement = test.movement;
  if (movement === null) return null;

  const angles = angleTableOf(test);
  const tempo = movement.tempo;

  return (
    <section
      aria-label={`Bewegungsanalyse ${test.name}`}
      className="flex flex-col gap-4 border-t border-border pt-4"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">Bewegungsanalyse</h3>
        <span className="text-xs text-muted-foreground" data-numeric>
          {movement.profileName} · {movement.repetitions}{' '}
          {movement.repetitions === 1 ? 'Wiederholung' : 'Wiederholungen'} ·{' '}
          {SECONDS.format(movement.durationMs / 1000)} s
        </span>
      </div>

      {test.images.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-medium">Woher die Werte kommen</h4>
          <ul className="flex flex-wrap gap-3">
            {test.images.map((image) => (
              <li key={image.id} className="flex max-w-[16rem] flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- the
                    bytes come from the object store through a route that checks
                    who is asking; an optimiser would need a public URL. */}
                <img
                  src={image.url}
                  alt={`Standbild: ${image.label}`}
                  loading="lazy"
                  className="w-full rounded border border-border object-contain"
                />
                <figcaption className="text-xs text-muted-foreground">{image.label}</figcaption>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        /**
         * A named gap, not a missing block.
         *
         * The analysis measured these positions and drew them; whether a still
         * survived is a question about storage, not about the analysis. Leaving
         * the section out entirely would read as "this analysis has no
         * positions", which is false — so the positions are named and the
         * absence is stated.
         */
        <StillPlaceholders positions={placeholderPositions(test)} choosing={choosing} />
      )}

      {movement.signal.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-medium">Bewegungsverlauf</h4>
          <div className="w-full overflow-x-auto">
            <SignalChart
              signal={movement.signal}
              reps={movement.reps}
              durationMs={movement.durationMs}
            />
          </div>
        </div>
      )}

      {tempo === null ? null : <Tempo tempo={tempo} />}

      <AngleGrid table={angles} />
    </section>
  );
}

/**
 * The angles as the analysis screen shows them: joint and side down, positions
 * across, the target marking exactly as it stands there.
 *
 * Open, not folded away. It is the table the analysis exists to produce, and a
 * record that hides its own numbers behind a disclosure makes a coach click to
 * find out whether there is anything to read.
 */
function AngleGrid({ table }: { readonly table: ReturnType<typeof angleTableOf> }) {
  if (table.rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-medium">Winkel je Position</h4>

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[26rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="py-2 pr-4 text-xs font-medium">
                Winkel
              </th>
              <th scope="col" className="py-2 pr-4 text-xs font-medium">
                Seite
              </th>
              {table.positions.map((position) => (
                <th key={position} scope="col" className="py-2 pr-4 text-xs font-medium">
                  {position}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.key} className="border-b border-border/60 last:border-0">
                <th scope="row" className="py-2 pr-4 text-left font-normal break-words">
                  {row.track}
                </th>
                {/* Lower case, as the analysis screen writes it: "links" is
                    an adverb here, not a heading. */}
                <td className="py-2 pr-4 text-muted-foreground lowercase">
                  {row.side ?? 'beidseitig'}
                </td>

                {table.positions.map((position) => {
                  const cell = row.cells.get(position);

                  return (
                    <td key={position} className="py-2 pr-4 align-top">
                      {cell === undefined ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <AngleValue cell={cell} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * One measured angle, marked against the coach's target where there is one.
 *
 * The analysis screen's own marking, deliberately unchanged: green with a tick
 * where the target was met, red with a cross where it was not, and never colour
 * on its own.
 */
function AngleValue({
  cell,
}: {
  readonly cell: { degrees: number; target: DocumentTarget | null };
}) {
  const measured = (
    <span className="font-medium" data-numeric>
      {DEGREES.format(cell.degrees)}°
    </span>
  );

  if (cell.target === null) return measured;

  return (
    <span
      className={`inline-flex flex-col gap-0.5 rounded px-1.5 py-1 ${
        cell.target.met
          ? 'bg-accent-soft text-accent-soft-foreground'
          : 'bg-destructive/10 text-destructive'
      }`}
    >
      {measured}
      <span className="flex items-center gap-1 text-xs font-medium">
        {cell.target.met ? (
          <Check aria-hidden="true" className="size-3 shrink-0" />
        ) : (
          <X aria-hidden="true" className="size-3 shrink-0" />
        )}
        Ziel {formatTarget(cell.target)} {cell.target.met ? 'erreicht' : 'nicht erreicht'}
      </span>
    </span>
  );
}

/**
 * How the set was executed.
 *
 * Only what the recording timed. A repetition whose turning point was clipped by
 * the sampling window contributes nothing, and a set too short for a trend shows
 * the repetitions without one.
 */
function Tempo({ tempo }: { readonly tempo: NonNullable<DocumentTest['movement']>['tempo'] }) {
  if (tempo === null) return null;

  const measured = tempo.reps.filter((rep) => rep.concentricVelocity !== null);
  const fastest = Math.max(...measured.map((rep) => rep.concentricVelocity ?? 0), 1);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="text-xs font-medium">Tempo je Wiederholung</h4>
        <span className="text-xs text-muted-foreground">Aufwärts, °/s</span>
      </div>

      <div
        role="img"
        aria-label={`Winkelgeschwindigkeit je Wiederholung: ${measured
          .map(
            (rep) =>
              // The engine numbers repetitions from one; the curve beside this
              // labels them the same way, and a second numbering would make the
              // two pictures disagree about the same set.
              `Wiederholung ${String(rep.index)}: ${DEGREES.format(rep.concentricVelocity ?? 0)} Grad pro Sekunde`,
          )
          .join(', ')}.`}
        className="flex items-end gap-1"
      >
        {measured.map((rep) => (
          <div key={rep.index} className="flex min-w-6 flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-sm bg-accent"
              style={{
                height: `${String(Math.max(4, ((rep.concentricVelocity ?? 0) / fastest) * 56))}px`,
              }}
            />
            <span className="text-[0.625rem] text-muted-foreground" data-numeric>
              {rep.index}
            </span>
          </div>
        ))}
      </div>

      {/* Three figures, not a sentence about them. Absent where the set was
          too short to time — see `setTempo`. */}
      {tempo.change === null ? null : (
        <p className="text-xs" data-numeric>
          <span className="text-muted-foreground">Beginn </span>
          {DEGREES.format(tempo.openingVelocity ?? 0)} °/s
          <span className="text-muted-foreground"> · Ende </span>
          {DEGREES.format(tempo.closingVelocity ?? 0)} °/s
          <span className="text-muted-foreground"> · </span>
          {PERCENT.format(tempo.change)}
        </p>
      )}
    </div>
  );
}

/**
 * The moments this analysis measured, whether or not a picture survived.
 *
 * Taken from the angle rows, because those are what the analysis actually
 * recorded — a placeholder invented from the profile could name a position the
 * run never reached.
 */
function placeholderPositions(test: DocumentTest): readonly string[] {
  const seen = new Set<string>();

  for (const row of anglesOf(test)) {
    if (row.axes.position !== null) seen.add(row.axes.position);
  }

  return [...seen].slice(0, 4);
}

function StillPlaceholders({
  positions,
  choosing = false,
}: {
  readonly positions: readonly string[];
  readonly choosing?: boolean;
}) {
  if (positions.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {/* Named rather than explained: the positions the analysis reached, with
          an empty frame where no picture survived. A sentence saying so would
          be the prose this view deliberately has none of. */}
      <h4 className="text-xs font-medium">
        {choosing ? 'Standbilder — noch keines ausgewählt' : 'Woher die Werte kommen'}
      </h4>

      <ul className="flex flex-wrap gap-3">
        {positions.map((position) => (
          <li key={position} className="flex w-40 flex-col gap-1">
            <div
              role="img"
              aria-label={`Kein Standbild für ${position} gespeichert`}
              className="grid h-24 w-full place-items-center rounded border border-dashed border-border bg-muted"
            >
              <ImageOff aria-hidden="true" className="size-5 text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">{position}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
