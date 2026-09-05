import type { ReactNode } from 'react';

import { ONE_REP_MAX_FORMULA, STRENGTH_LEVEL_LABELS_DE } from '@apex/domain';

import { MeasurementChart, type ChartGroupView } from '@/components/common/measurement-chart';

import {
  DATE_LONG,
  DATE_SHORT,
  formatDifference,
  formatTarget,
  formatValue,
  headlineRows,
  type DocumentRow,
  type DocumentTest,
  bodyFatView,
  strengthView,
  type DocumentAthlete,
  type DocumentView,
} from './document';
import { MovementBlock } from './movement-block';
import { TextField } from './text-field';

const KILOS = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
/** Two places: the standards are stated to two, and 1,25× is not 1,3×. */
const FACTOR = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * The analysis, as one document.
 *
 * ## What the shape is for
 *
 * Facts as tiles, one per test, in a grid — not one table per test stacked down
 * the page. A coach reading four tests used to scroll past four six-column
 * tables that scrolled sideways on a phone; the same four tests are now four
 * tiles that sit next to each other, and the complete numbers are one disclosure
 * away for whoever wants them.
 *
 * ## Colour makes a claim, so it is earned
 *
 * Green and red appear only where the test declared which way it wanted the
 * number to go. Everything else is grey and carries the signed difference and
 * nothing more — no arrow, no adjective. The rule is `tendencyOf`, in the
 * domain, and it is the same rule the frozen document renders from.
 *
 * Colour is never alone: every coloured value carries an arrow **and** a word.
 *
 * ## Why the whole table survives
 *
 * A tile shows what matters; the table shows everything, and it is what a
 * screen reader reads out. Collapsing it keeps the page short without putting
 * any number out of reach.
 */

/** What the coach may change while reading. Absent for the athlete's copy. */
export interface DocumentEditing {
  readonly onText: (
    target: { kind: 'overall' } | { kind: 'section'; moduleId: string },
    field: 'interpretation' | 'recommendation',
    text: string,
  ) => void;
  readonly disabled: boolean;
  /** Rendered above the document — the choice of which tests it draws on. */
  readonly basis?: ReactNode;
  /**
   * Rendered inside a test — which of its stills the document uses.
   *
   * A function rather than a prop on the test, because *which stills exist* is a
   * question for the object store and the athlete's copy must never ask it.
   */
  readonly stillPicker?: (moduleId: string) => ReactNode;
  /**
   * The actions of one test, in the head of its tile.
   *
   * A function rather than a prop on the test, because what may be done with a
   * test is the workspace's business and the athlete's copy has none of it.
   */
  readonly testMenu?: (moduleId: string) => ReactNode;
}

const TENDENCY_TONE = {
  toward: { text: 'text-accent-ink', dot: 'var(--accent)', arrow: '↓' },
  away: { text: 'text-destructive', dot: 'var(--destructive)', arrow: '↑' },
  unchanged: { text: 'text-muted-foreground', dot: 'var(--muted-foreground)', arrow: '→' },
} as const;

/**
 * Whether a group has anything to draw.
 *
 * One point is a value, not a line — and a chart with a single dot reads as a
 * broken diagram rather than as "this test has one stage".
 */
function hasCurve(group: ChartGroupView): boolean {
  return group.series.some((line) => line.points.length > 1);
}

/** The arrow points the way the number moved, not the way it should have. */
function arrowFor(row: DocumentRow): string {
  if (row.difference === null || row.tendency === null) return '';

  if (row.difference === 0) return TENDENCY_TONE.unchanged.arrow;

  return row.difference < 0 ? '↓' : '↑';
}

function toneFor(row: DocumentRow) {
  return row.tendency === null ? null : TENDENCY_TONE[row.tendency];
}

export function ReportDocument({
  view,
  editing,
  forPrint = false,
}: {
  readonly view: DocumentView;
  readonly editing?: DocumentEditing;
  /**
   * Whether this rendering is going onto paper.
   *
   * One thing genuinely cannot be settled in a stylesheet: a collapsed
   * `<details>` prints as a triangle nobody can open, and the rows behind it
   * are simply absent from the file. CSS can hide the summary but not open the
   * disclosure — so the print route says so, and the table is rendered open.
   */
  readonly forPrint?: boolean;
}) {
  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-1.5">
        <span className="eyebrow">Auswertung</span>
        <h1 className="text-2xl font-semibold text-pretty">{view.athleteName}</h1>
        <p className="text-sm text-muted-foreground">
          Untersuchung vom <span data-numeric>{DATE_LONG.format(view.performedAt)}</span> · erstellt
          von {view.coachName}
        </p>
      </header>

      {editing?.basis}

      <Overall view={view} editing={editing} />

      {view.tests.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Diese Auswertung zieht noch keinen Test heran.
        </p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-1">
          {view.tests.map((test) => (
            <TestTile key={test.moduleId} test={test} athlete={view.athlete} editing={editing} />
          ))}
        </div>
      )}

      <FullTable tests={view.tests} open={forPrint} />
    </article>
  );
}

/** The analysis as a whole. Read first, written last. */
function Overall({
  view,
  editing,
}: {
  readonly view: DocumentView;
  readonly editing?: DocumentEditing;
}) {
  const written =
    view.overall.interpretation.trim() !== '' || view.overall.recommendation.trim() !== '';

  if (editing === undefined && !written) return null;

  return (
    <section
      aria-labelledby="overall"
      className="flex flex-col gap-3 rounded-md border border-accent/35 bg-accent-soft p-4 sm:p-5"
    >
      <h2 id="overall" className="text-accent-ink text-base font-semibold">
        Einschätzung deines Coaches
      </h2>

      {editing === undefined ? (
        <>
          <Prose text={view.overall.interpretation} tone="accent" />
          {view.overall.recommendation.trim() === '' ? null : (
            <div className="flex flex-col gap-1">
              <h3 className="text-accent-ink text-xs font-semibold tracking-wide uppercase">
                Empfehlung
              </h3>
              <Prose text={view.overall.recommendation} tone="accent" />
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <TextField
            id="overall-interpretation"
            label="Einschätzung über alle Tests"
            hint="Was ergibt sich aus den Ergebnissen zusammengenommen?"
            value={view.overall.interpretation}
            disabled={editing.disabled}
            onSave={(text) => {
              editing.onText({ kind: 'overall' }, 'interpretation', text);
            }}
          />
          <TextField
            id="overall-recommendation"
            label="Empfehlung"
            hint="Was schlagen Sie vor?"
            value={view.overall.recommendation}
            disabled={editing.disabled}
            onSave={(text) => {
              editing.onText({ kind: 'overall' }, 'recommendation', text);
            }}
          />
        </div>
      )}
    </section>
  );
}

/** One test: its numbers, its pictures, and what the coach made of it. */
function TestTile({
  test,
  athlete,
  editing,
}: {
  readonly test: DocumentTest;
  readonly athlete: DocumentAthlete;
  readonly editing?: DocumentEditing;
}) {
  const written = test.interpretation.trim() !== '' || test.recommendation.trim() !== '';

  // A body-composition test reads differently from everything else — see
  // `bodyFatView`. `null` for every test that is not one.
  const bodyFat = bodyFatView(test, athlete);
  // And so does a maximal strength test — see `strengthView`.
  const strength = bodyFat === null ? strengthView(test, athlete) : null;

  return (
    <section
      aria-label={test.name}
      className={`flex h-full flex-col gap-3 rounded-md border border-border bg-card p-4 ${
        // A curve — of a movement or of a staged test — carries pictures and a
        // table; squeezed into a third of the row it would be unreadable, and
        // the order of the document is what keeps it beside its own test.
        test.movement === null && test.charts.length === 0 && bodyFat === null && strength === null
          ? ''
          : 'sm:col-span-2 xl:col-span-3'
      }`}
    >
      {/* Name, date, status — and everything a coach can *do* on the right,
          never among the facts. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
            {[test.typeLabel, test.protocolLabel].filter((part) => part !== null).join(' · ')}
          </span>
          <h2 className="text-sm font-semibold break-words">{test.name}</h2>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span data-numeric>{DATE_SHORT.format(test.performedAt)}</span>
            {test.statusLabel === '' ? null : <span>· {test.statusLabel}</span>}
          </span>
        </div>

        {editing?.testMenu === undefined ? null : (
          <div className="shrink-0">{editing.testMenu(test.moduleId)}</div>
        )}
      </div>

      {bodyFat !== null ? (
        <BodyFatReading view={bodyFat} />
      ) : strength !== null ? (
        <StrengthReading view={strength} />
      ) : headlineRows(test).length === 0 ? (
        /* Only where there is genuinely nothing. A staged test has no headline
           readings *because* its readings are the curve below, and a video
           analysis's angles sit in its own table — saying "no value recorded"
           beside either would be false. */
        test.rows.length === 0 && test.charts.length === 0 && test.movement === null ? (
          <p className="text-xs text-muted-foreground">Für diesen Test wurde kein Wert erfasst.</p>
        ) : null
      ) : (
        <dl className="flex flex-col gap-2.5">
          {headlineRows(test).map((row) => (
            <Reading key={row.key} row={row} single={headlineRows(test).length === 1} />
          ))}
        </dl>
      )}

      <PercentileBlock test={test} />

      {/* A staged test is a curve, not a row of numbers: a lactate test read as
          "stage 4: 4,1 mmol/l" says nothing a coach can act on, and the same
          test drawn over the speed it was performed at says everything. Only
          where there is more than one point — a single stage is not a line.

          Never for a video analysis: its curve is the movement itself, drawn in
          the block below. The stage charts of its angles put "Gelenkwinkel ·
          Rechts · Hüfte · gebeugt" over a single point three times above the
          picture that actually shows it. */}
      {test.movement !== null ||
      test.charts.filter((group) => hasCurve(group)).length === 0 ? null : (
        /* Two or three beside each other where the width allows — `dense`, so
           the sentence explaining what a curve is appears once on the test
           screen and never three times here. */
        <MeasurementChart
          dense
          groups={test.charts.filter((group) => hasCurve(group)).slice(0, 3)}
        />
      )}

      <MovementBlock test={test} choosing={editing?.stillPicker !== undefined} />

      {editing?.stillPicker?.(test.moduleId)}

      {test.derivations.length === 0 ? null : (
        <p className="text-[0.6875rem] text-muted-foreground">
          Berechnet nach {test.derivations.map(methodLabel).join(', ')}.
        </p>
      )}

      {editing === undefined ? (
        written ? (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <Prose text={test.interpretation} tone="body" />
            {test.recommendation.trim() === '' ? null : (
              <p className="text-sm text-pretty whitespace-pre-line">
                <span className="font-medium">Empfehlung: </span>
                {test.recommendation}
              </p>
            )}
          </div>
        ) : null
      ) : (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <TextField
            id={`interpretation-${test.moduleId}`}
            label="Einordnung"
            hint="Was bedeuten diese Werte fachlich?"
            value={test.interpretation}
            disabled={editing.disabled}
            rows={2}
            onSave={(text) => {
              editing.onText({ kind: 'section', moduleId: test.moduleId }, 'interpretation', text);
            }}
          />
          <TextField
            id={`recommendation-${test.moduleId}`}
            label="Empfehlung"
            hint="Was folgt daraus für diesen Test?"
            value={test.recommendation}
            disabled={editing.disabled}
            rows={2}
            onSave={(text) => {
              editing.onText({ kind: 'section', moduleId: test.moduleId }, 'recommendation', text);
            }}
          />
        </div>
      )}
    </section>
  );
}

/** One measured quantity inside a tile. The number is the hero. */
function Reading({ row, single }: { readonly row: DocumentRow; readonly single: boolean }) {
  const tone = toneFor(row);

  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
        <span>{row.typeName}</span>
        {row.coordinates === '' ? null : <span>· {row.coordinates}</span>}
      </dt>

      <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className={`font-semibold ${single ? 'text-2xl' : 'text-lg'} tracking-tight`}
          data-numeric
        >
          {formatValue(row.value, row.unit, row.measurementTypeKey)}
        </span>

        {row.difference === null ? null : (
          <span className={`text-xs ${tone?.text ?? 'text-muted-foreground'}`} data-numeric>
            {arrowFor(row)} {formatDifference(row.difference, row.unit)}
          </span>
        )}

        {row.target === null ? null : (
          <span
            className={`rounded px-1.5 py-0.5 text-[0.6875rem] font-semibold ${
              row.target.met
                ? 'text-accent-ink bg-accent-soft'
                : 'bg-destructive/10 text-destructive'
            }`}
            data-numeric
          >
            Ziel {formatTarget(row.target)} {row.target.met ? '· erreicht' : '· nicht erreicht'}
          </span>
        )}
      </dd>
    </div>
  );
}

/**
 * A maximal strength test: the standing, then the numbers it was read from.
 *
 * ## Why the level is a sentence and the rest is a table
 *
 * The level is what the coach acts on and it is one statement per lift, so it
 * is written out. The load, the repetitions and the estimate are working
 * numbers that have to be *checkable* — a level nobody can trace back to kilos
 * is a verdict, and this shows its arithmetic.
 *
 * ## Why the table is attributed
 *
 * Apex OS ships no reference values. What decides the level here is the coach's
 * own orientation table, so the block says so, states the multiple the athlete
 * reached, and names the formula the estimate came from. Nothing is coloured by
 * level: which band an athlete should be in is their coach's sentence to write.
 */
function StrengthReading({
  view,
}: {
  readonly view: NonNullable<ReturnType<typeof strengthView>>;
}) {
  const standings = view.lifts.filter((lift) => lift.standing !== null);

  return (
    <div className="flex flex-col gap-3">
      {standings.length === 0 ? null : (
        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
          <h3 className="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Fitnesslevel nach den Kraftstandards
          </h3>

          <ul className="flex flex-col gap-2">
            {standings.map((lift) => {
              // Non-null by the filter above; narrowed so the markup stays flat.
              const standing = lift.standing;
              if (standing === null) return null;

              return (
                <li key={lift.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold">
                    {standing.level === null
                      ? 'Unter dem Anfängerwert'
                      : STRENGTH_LEVEL_LABELS_DE[standing.level]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {lift.label} · <span data-numeric>{FACTOR.format(standing.factor)}×</span>{' '}
                    Körpergewicht
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="text-[0.6875rem] text-pretty text-muted-foreground">
            Nach der Orientierungstabelle für Kniebeugen, Bankdrücken und Kreuzheben — als
            Vielfaches des Körpergewichts. Kein externer Normwert.
          </p>
        </div>
      )}

      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Erfasste Lasten und geschätztes Einer-Maximum</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="py-2 pr-4 text-xs font-medium">
                Übung
              </th>
              <th scope="col" className="py-2 pr-4 text-xs font-medium">
                Last
              </th>
              <th scope="col" className="py-2 pr-4 text-xs font-medium">
                Wdh.
              </th>
              <th scope="col" className="py-2 pr-4 text-xs font-medium">
                1RM ({ONE_REP_MAX_FORMULA})
              </th>
              <th scope="col" className="py-2 text-xs font-medium">
                × Körpergewicht
              </th>
            </tr>
          </thead>
          <tbody>
            {view.lifts.map((lift) => (
              <tr key={lift.key} className="border-b border-border/60 last:border-0">
                <th scope="row" className="py-2 pr-4 text-left font-normal break-words">
                  {lift.label}
                </th>
                <td className="py-2 pr-4" data-numeric>
                  {KILOS.format(lift.loadKg)} kg
                </td>
                <td className="py-2 pr-4" data-numeric>
                  {lift.repetitions ?? '—'}
                </td>
                <td className="py-2 pr-4 font-medium" data-numeric>
                  {lift.oneRepMaxKg === null ? '—' : `${KILOS.format(lift.oneRepMaxKg)} kg`}
                </td>
                <td className="py-2" data-numeric>
                  {lift.standing === null ? '—' : `${FACTOR.format(lift.standing.factor)}×`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * A body-composition test: the answer, its context, then the working numbers.
 *
 * Three sizes, deliberately: the derived percentage at display size because it
 * is what the test was performed for; weight, BMI and age at label size because
 * they are what makes the percentage mean something; and every reading in a
 * horizontal table below, which is where a skinfold belongs.
 *
 * The table runs horizontally — quantities across, one row of values — because
 * a body-composition test records one reading per site at one moment. Down the
 * page those ten rows read like ten findings; across, they read like one
 * measurement, which is what they are.
 *
 * No colour and no band anywhere: what a body fat percentage means for a
 * particular athlete is the coach's sentence, and Apex OS carries no norms.
 */
function BodyFatReading({ view }: { readonly view: NonNullable<ReturnType<typeof bodyFatView>> }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{view.headline.typeName}</span>
          <span className="text-4xl leading-none font-semibold tracking-tight" data-numeric>
            {formatValue(view.headline.value, view.headline.unit, view.headline.measurementTypeKey)}
          </span>
        </div>

        {view.context.length === 0 ? null : (
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            {view.context.map((item) => (
              <div key={item.label} className="flex flex-col">
                <dt className="text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
                  {item.label}
                </dt>
                <dd className="text-base font-medium" data-numeric>
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {view.table.length === 0 ? null : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Alle Werte dieser Körperzusammensetzung</caption>
            <thead>
              <tr className="border-b border-border">
                {view.table.map((row) => (
                  <th
                    key={row.key}
                    scope="col"
                    className="px-2 py-1.5 text-left align-bottom text-xs font-medium whitespace-nowrap text-muted-foreground"
                  >
                    {row.typeName}
                    {row.coordinates === '' ? null : (
                      <span className="block font-normal">{row.coordinates}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {view.table.map((row) => (
                  <td
                    key={row.key}
                    className="px-2 py-2 font-medium whitespace-nowrap"
                    data-numeric
                  >
                    {formatValue(row.value, row.unit, row.measurementTypeKey)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Where the values stand among the workspace's own athletes.
 *
 * ## Why the group size is never omitted
 *
 * Apex OS carries no norms. This compares against the athletes *this workspace*
 * measured on the same protocol, which is a real group and a small one — so the
 * sentence is always "von n Athleten", never "im 68. Perzentil" on its own.
 * A percentile without its population is the shape of evidence without the
 * substance.
 *
 * ## Why it is a scale and not a fill
 *
 * The bar runs the full 0–100 with a marker on it and quarter ticks behind,
 * rather than filling up like a score: it says *where among these people*, not
 * *how much*. Nothing here is coloured by verdict — a percentile is a position,
 * and which positions a coach wants is their sentence to write, not the
 * document's to imply.
 */
function PercentileBlock({ test }: { readonly test: DocumentTest }) {
  const ranked = headlineRows(test).filter((row) => row.percentile !== null);
  if (ranked.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
      <h3 className="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
        Im Arbeitsbereich eingeordnet
      </h3>

      <ul className="flex flex-col gap-2.5">
        {ranked.map((row) => {
          // Non-null by the filter above; narrowed here so the markup stays flat.
          const mark = row.percentile;
          if (mark === null) return null;

          return (
            <li key={row.key} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                <span className="min-w-0 break-words">
                  {row.typeName}
                  {row.coordinates === '' ? '' : ` · ${row.coordinates}`}
                </span>
                <span className="font-medium" data-numeric>
                  {mark.percentile}. Perzentil von {mark.cohort} Athleten
                </span>
              </div>

              <div className="relative h-3 w-full">
                <svg
                  viewBox="0 0 100 12"
                  preserveAspectRatio="none"
                  className="h-3 w-full"
                  role="img"
                  aria-label={`${row.typeName}: ${String(mark.percentile)}. Perzentil unter ${String(mark.cohort)} verglichenen Athleten dieses Arbeitsbereichs.`}
                >
                  <rect x="0" y="5" width="100" height="2" rx="1" fill="var(--border)" />
                  {[25, 50, 75].map((tick) => (
                    <rect
                      key={tick}
                      x={tick - 0.25}
                      y="2"
                      width="0.5"
                      height="8"
                      fill="var(--border)"
                    />
                  ))}
                  <circle
                    cx={Math.min(97.5, Math.max(2.5, mark.percentile))}
                    cy="6"
                    r="2.5"
                    fill="var(--chart-2)"
                  />
                </svg>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[0.6875rem] text-pretty text-muted-foreground">
        Verglichen mit den Athleten dieses Arbeitsbereichs, die denselben Test auf demselben
        Protokoll absolviert haben. Kein externer Normwert.
      </p>
    </div>
  );
}

/**
 * Everything, in full.
 *
 * Closed by default and never removed. The tiles are a reading of the numbers;
 * this is the numbers, and it is what a screen reader gets a table structure
 * from.
 */
/**
 * The name of a computed method, repairing what an older document froze.
 *
 * A snapshot stores the **label**, and for a while the table that produced it
 * did not know about the energy conversion — so documents published in that
 * window carry the raw key `atwater_energy`, which is what an athlete then read
 * on their analysis. A published document is frozen (§16) and must not be
 * rewritten, so the repair belongs here, at the moment of showing: a stored
 * value that is recognisably a method key is named; anything else is printed as
 * it was written.
 */
function methodLabel(stored: string): string {
  const known: Readonly<Record<string, string>> = {
    jackson_pollock_3: 'Jackson & Pollock, 3 Punkte',
    jackson_pollock_7: 'Jackson & Pollock, 7 Punkte',
    atwater_energy: 'Atwater-Faktoren (4 · 4 · 9 kcal/g)',
  };

  return known[stored] ?? stored;
}

function FullTable({
  tests,
  open = false,
}: {
  readonly tests: readonly DocumentTest[];
  readonly open?: boolean;
}) {
  const rows = tests.flatMap((test) => test.rows.map((row) => ({ test, row })));
  if (rows.length === 0) return null;

  return (
    <details open={open} className="rounded-md border border-border bg-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Alle Werte als Tabelle <span data-numeric>({rows.length})</span>
      </summary>

      <div className="w-full overflow-x-auto border-t border-border">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-2 font-medium">Test</th>
              <th className="px-4 py-2 font-medium">Messgröße</th>
              <th className="px-4 py-2 font-medium">Gemessen</th>
              <th className="px-4 py-2 font-medium">Früher</th>
              <th className="px-4 py-2 font-medium">Bestwert</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ test, row }) => (
              <tr
                key={`${test.moduleId}-${row.key}`}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-2 align-top break-words">{test.name}</td>
                <td className="px-4 py-2 align-top">
                  <span className="break-words">{row.typeName}</span>
                  {row.coordinates === '' ? null : (
                    <span className="block text-xs break-words text-muted-foreground">
                      {row.coordinates}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 align-top" data-numeric>
                  {formatValue(row.value, row.unit, row.measurementTypeKey)}
                  <span className="block text-xs text-muted-foreground">
                    {DATE_SHORT.format(row.capturedAt)}
                  </span>
                </td>
                <td className="px-4 py-2 align-top" data-numeric>
                  {row.previous === null ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <>
                      {formatValue(row.previous, row.unit, row.measurementTypeKey)}
                      {row.difference === null ? null : (
                        <span className="block text-xs text-muted-foreground">
                          {formatDifference(row.difference, row.unit)}
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="px-4 py-2 align-top" data-numeric>
                  {row.best === null ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <>
                      {formatValue(row.best.value, row.unit, row.measurementTypeKey)}
                      <span className="block text-xs text-muted-foreground">
                        {DATE_SHORT.format(row.best.capturedAt)}
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Prose({ text, tone }: { readonly text: string; readonly tone: 'accent' | 'body' }) {
  if (text.trim() === '') return null;

  return (
    <p
      className={`max-w-prose text-sm text-pretty whitespace-pre-line ${
        tone === 'accent' ? 'text-accent-ink' : ''
      }`}
    >
      {text}
    </p>
  );
}
