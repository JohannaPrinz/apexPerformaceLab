'use client';

import { useRef, useState, useTransition } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { ChevronDown, GripVertical, Plus, X } from 'lucide-react';

import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';

import {
  recordTrackingAction,
  setTrendCardAction,
  setTrendCardOrderAction,
} from '../server/actions';
import { encodeTrendCards, type TrendCardSelection } from '../trend-slots';

import { BiofeedbackWeek, type BiofeedbackWeekView } from './biofeedback-week';
import { CycleMonth, type CycleMonthView } from './cycle-month';
import { NutritionWeek, type NutritionWeekView } from './nutrition-week';

/**
 * The trends of one athlete, as many as the coach wants.
 *
 * ## Nothing until something is asked for
 *
 * The page opens with no cards. Which trends matter differs per athlete and per
 * question, and a screen that guessed two of them would be a screen a coach has
 * to clear before it is useful.
 *
 * ## Why the cards live in the address bar
 *
 * What a coach is looking at is worth keeping over a reload and worth sending
 * to a colleague, and neither needs a column in the database. It is also the
 * only place a *server*-rendered chart can read a choice from without a round
 * trip through client state.
 *
 * ## What is drawn, and what is not
 *
 * Points and dates. No trend line, no average, no rate of change, no verdict —
 * the catalogue holds no reference range and the model records no direction for
 * any quantity, so a chart that leaned one way would be inventing one. The
 * cycle card lists what was written down and computes no phase, length or
 * prediction.
 */

export interface TrendOptionView {
  readonly key: string;
  readonly kind: 'measurement' | 'cycle' | 'nutrition' | 'biofeedback';
  readonly name: string;
  readonly unit: string;
  readonly exercises: readonly { readonly id: string; readonly name: string }[];
  readonly count: number;
}

export interface TrendEpisodeView {
  readonly id: string;
  readonly startedOn: Date;
  readonly endedOn: Date | null;
  readonly note: string | null;
  readonly recordedBy: 'ATHLETE' | 'COACH';
}

export interface TrendChartView {
  readonly key: string;
  readonly kind: 'measurement' | 'cycle' | 'nutrition' | 'biofeedback';
  readonly title: string;
  readonly unit: string;
  readonly series: readonly {
    readonly key: string;
    readonly label: string;
    readonly points: readonly { readonly at: Date; readonly value: number }[];
  }[];
  readonly episodes: readonly TrendEpisodeView[];
  readonly exercises: readonly { readonly id: string; readonly name: string }[];
  readonly exerciseIds: readonly string[];
}

/**
 * The table cards' keys.
 *
 * Repeated rather than imported from the server slice: this file is
 * `'use client'`, and `trends.ts` is `server-only`. The strings are the
 * contract between them, and `trend-cards.test.tsx` is where the two are held
 * together.
 */
const NUTRITION_CARD_KEY = 'nutrition';
const BIOFEEDBACK_CARD_KEY = 'biofeedback';

/** The cards that are tables, and therefore not part of the chart grid. */
const TABLE_CARD_KEYS = new Set([NUTRITION_CARD_KEY, BIOFEEDBACK_CARD_KEY]);

const day = (value: Date): string =>
  new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeZone: 'UTC' }).format(value);

const decimal = (value: number): string =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value);

export function TrendCards({
  athleteId,
  options,
  charts,
  cards,
  nutrition,
  biofeedback,
  cycle,
}: {
  athleteId: string;
  options: readonly TrendOptionView[];
  /** One entry per card, in the same order. */
  charts: readonly (TrendChartView | null)[];
  cards: readonly TrendCardSelection[];
  /**
   * The table cards, each loaded only where it is on screen.
   *
   * They sit beside the charts rather than among them because each is several
   * quantities across seven days: half of a two-column grid is not a width
   * either can be read at.
   */
  nutrition: NutritionWeekView | null;
  biofeedback: BiofeedbackWeekView | null;
  /** The cycle month, loaded only where that card is on screen. */
  cycle: CycleMonthView | null;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [adding, setAdding] = useState(false);
  /** The card being dragged, and the one it is over. */
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  /**
   * Whether the pointer went down on a drag handle.
   *
   * A **ref**, not state, and that is the whole point. The browser reads
   * `draggable` and decides whether a drag may begin during the very gesture
   * that would set the state — so arming it with `useState` leaves the
   * attribute one render behind, and the drag either fails or works by luck
   * depending on when React flushed. A browser run found exactly that: a real
   * press-and-move on the handle started no drag at all.
   *
   * So every card stays draggable and `onDragStart` cancels the ones that did
   * not begin on a handle. A ref is readable in the same tick, which is what
   * makes that check correct rather than lucky — and it keeps text selection
   * inside the tables' input fields working, because dragging text never arms
   * it.
   */
  const armed = useRef(false);
  /**
   * Which card is being dragged, readable in the same tick.
   *
   * The state below drives the highlight; this drives the *decision*. A drag
   * can produce a single `dragover` immediately followed by a `drop`, and a
   * handler that read the index from state would see `null` in both — so
   * `dragover` would never call `preventDefault`, the drop would be refused,
   * and the card would spring back. A browser run found precisely that: every
   * drag event fired and nothing moved.
   */
  const dragFrom = useRef<number | null>(null);

  const write = (next: readonly TrendCardSelection[]) => {
    const params = new URLSearchParams(search.toString());
    params.delete('card');
    for (const value of encodeTrendCards(next)) params.append('card', value);

    router.replace(`?${params.toString()}`, { scroll: false });
  };

  /**
   * Adding and removing a card writes twice, on purpose.
   *
   * The address bar changes immediately, so the screen responds without waiting
   * for a round trip; the athlete's stored selection follows, so the choice
   * survives leaving the page. The URL stays the way one particular view is
   * linked; the record is what the profile opens with.
   */
  const add = (key: string) => {
    setAdding(false);
    write([...cards, { key, exerciseIds: [] }]);
    void setTrendCardAction(athleteId, key, true);
  };

  const remove = (key: string) => {
    write(cards.filter((card) => card.key !== key));
    void setTrendCardAction(athleteId, key, false);
  };

  /** What is not on screen yet. The same card twice would be one card twice. */
  const available = options.filter((option) => !cards.some((card) => card.key === option.key));

  /**
   * Moving a card to a new position.
   *
   * Writes twice, like adding and removing: the address bar changes at once so
   * the screen responds without a round trip, and the athlete's stored order
   * follows so the arrangement survives leaving the page.
   */
  const moveTo = (from: number, to: number) => {
    if (from === to || to < 0 || to >= cards.length) return;

    const next = [...cards];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);

    write(next);
    void setTrendCardOrderAction(
      athleteId,
      next.map((card) => card.key),
    );
  };

  return (
    <section aria-labelledby="trends" className="flex flex-col gap-4">
      {/* Collapsible, and **open** to begin with — the opposite of the master
          data above, because this is what a coach comes back to the profile
          for. `<details>` rather than state, so the browser keeps whichever way
          they leave it.

          The heading alone is the summary: a button inside a `<summary>` is a
          control inside a control, and clicking it would toggle the section as
          well as fire. "Karte hinzufügen" therefore sits in the body. */}
      <details open className="group">
        <summary
          className={`${TOUCH_TARGET} ${FOCUS_RING} flex w-fit cursor-pointer list-none items-center gap-2 rounded [&::-webkit-details-marker]:hidden`}
        >
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
          <h2 id="trends" className="text-lg font-semibold">
            Verlauf
          </h2>
          <span className="text-xs text-muted-foreground group-open:hidden">einblenden</span>
          <span className="hidden text-xs text-muted-foreground group-open:inline">ausblenden</span>
        </summary>

        {/* The body in its own column rather than flex on the `<details>`
            itself — the same shape the master-data block above uses, so the two
            disclosures on this page behave identically. `min-w-0` because what
            follows holds two tables that scroll horizontally inside
            themselves, and a flex item that will not shrink below its content
            would take the page sideways with them. */}
        <div className="mt-4 flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              Dargestellt wird, was erfasst wurde — es findet keine fachliche Bewertung statt.
            </p>

            {available.length === 0 ? null : (
              <Button
                type="button"
                variant="accent"
                className={TOUCH_BUTTON}
                onClick={() => {
                  setAdding((open) => !open);
                }}
              >
                <Plus aria-hidden="true" />
                Karte hinzufügen
              </Button>
            )}
          </div>

          {!adding ? null : (
            <ul className="flex flex-wrap gap-2 rounded-md border border-border bg-card p-3">
              {available.map((option) => (
                <li key={option.key}>
                  <button
                    type="button"
                    onClick={() => {
                      add(option.key);
                    }}
                    className={`${FOCUS_RING} ${TOUCH_TARGET} flex items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted`}
                  >
                    {option.name}
                    {option.unit === '' ? null : (
                      <span className="text-xs text-muted-foreground">{option.unit}</span>
                    )}
                    {option.count === 0 ? (
                      <span className="text-xs text-muted-foreground">noch nichts erfasst</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {cards.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
              {options.length === 0
                ? 'Für diesen Athleten lässt sich noch nichts über die Zeit darstellen.'
                : 'Noch keine Karte. Über „Karte hinzufügen" einen Verlauf aufnehmen.'}
            </p>
          ) : (
            /* One list, in the order the coach arranged, rather than the tables
               above a grid of charts. Reordering only means something if what
               is reordered is what is drawn — and the tables span both columns,
               because a week of five quantities is not readable in half a row.

               One column on a phone, two from `md`: two charts sharing a 375px
               row would be two illegible charts. */
            <ul className="grid gap-4 md:grid-cols-2">
              {cards.map((card, index) => {
                const table = TABLE_CARD_KEYS.has(card.key);
                const title =
                  charts[index]?.title ??
                  options.find((option) => option.key === card.key)?.name ??
                  card.key;

                return (
                  <li
                    key={`${card.key}-${String(index)}`}
                    className={`flex min-w-0 flex-col gap-1 ${table ? 'md:col-span-2' : ''} ${
                      dragging === index ? 'opacity-50' : ''
                    } ${over === index && dragging !== index ? 'rounded-md ring-2 ring-accent ring-offset-2 ring-offset-background' : ''}`}
                    draggable
                    // Capture, so this runs before the handle's own handler and
                    // a press anywhere else disarms the drag.
                    onMouseDownCapture={() => {
                      armed.current = false;
                    }}
                    onDragStart={(event) => {
                      // Not from a handle: a text selection inside one of the
                      // tables, which must not pick the card up.
                      if (!armed.current) {
                        event.preventDefault();

                        return;
                      }

                      dragFrom.current = index;
                      setDragging(index);
                      event.dataTransfer.effectAllowed = 'move';
                      // Firefox starts no drag without data on the transfer.
                      event.dataTransfer.setData('text/plain', card.key);
                    }}
                    onDragOver={(event) => {
                      if (dragFrom.current === null) return;
                      // Without this the drop is refused and the card springs
                      // back, however convincing the drag looked.
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setOver(index);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = dragFrom.current;
                      if (from !== null) moveTo(from, index);
                      dragFrom.current = null;
                      setDragging(null);
                      setOver(null);
                      armed.current = false;
                    }}
                    onDragEnd={() => {
                      dragFrom.current = null;
                      setDragging(null);
                      setOver(null);
                      armed.current = false;
                    }}
                  >
                    {/* Drag for a mouse, buttons for everything else. Native
                        drag-and-drop does not fire on touch at all, and it is
                        unreachable from the keyboard — so the buttons are not a
                        fallback, they are the accessible path. */}
                    <div className="flex items-center gap-0.5">
                      <span
                        aria-hidden="true"
                        onMouseDown={() => {
                          armed.current = true;
                        }}
                        onMouseUp={() => {
                          armed.current = false;
                        }}
                        className="flex cursor-grab items-center rounded px-1 py-0.5 text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
                      >
                        <GripVertical className="size-4" />
                      </span>

                      <button
                        type="button"
                        aria-label={`${title} nach vorn`}
                        disabled={index === 0}
                        onClick={() => {
                          moveTo(index, index - 1);
                        }}
                        className={`${FOCUS_RING} ${TOUCH_TARGET} rounded px-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`${title} nach hinten`}
                        disabled={index === cards.length - 1}
                        onClick={() => {
                          moveTo(index, index + 1);
                        }}
                        className={`${FOCUS_RING} ${TOUCH_TARGET} rounded px-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30`}
                      >
                        ↓
                      </button>

                      <span className="text-[10px] text-muted-foreground" data-numeric>
                        {index + 1}/{cards.length}
                      </span>
                    </div>

                    {card.key === BIOFEEDBACK_CARD_KEY ? (
                      biofeedback === null ? null : (
                        <BiofeedbackWeek
                          athleteId={athleteId}
                          week={biofeedback}
                          onRemove={() => {
                            remove(BIOFEEDBACK_CARD_KEY);
                          }}
                        />
                      )
                    ) : card.key === NUTRITION_CARD_KEY ? (
                      nutrition === null ? null : (
                        <NutritionWeek
                          athleteId={athleteId}
                          week={nutrition}
                          onRemove={() => {
                            remove(NUTRITION_CARD_KEY);
                          }}
                        />
                      )
                    ) : (
                      <TrendCard
                        athleteId={athleteId}
                        chart={charts[index] ?? null}
                        cardKey={card.key}
                        cycle={cycle}
                        onRemove={() => {
                          remove(card.key);
                        }}
                        onNarrow={(exerciseIds) => {
                          write(
                            cards.map((entry, position) =>
                              position === index ? { ...entry, exerciseIds } : entry,
                            ),
                          );
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </details>
    </section>
  );
}

/**
 * Writing one value down, outside any examination.
 *
 * ## Why it sits inside the card
 *
 * The card already names the quantity and its unit, so the form asks for two
 * things and nothing else. A dialog somewhere else would have to ask which
 * quantity — a question the coach has already answered by being here.
 *
 * ## Why the date is asked for and not assumed
 *
 * "Today" is wrong more often than it looks: a coach enters Monday's weight on
 * Wednesday, and an athlete opening a fresh card is asked for a starting value
 * that is by definition in the past. A reading dated to the moment it was typed
 * would put a bend in the curve that nobody's body made.
 */
function AddValue({
  athleteId,
  cardKey,
  unit,
  starting,
}: {
  readonly athleteId: string;
  readonly cardKey: string;
  readonly unit: string;
  /** True where the card holds nothing yet — the wording changes, not the form. */
  readonly starting: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState('');
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    // A German keyboard produces a comma, and refusing that would be refusing
    // the coach's own keyboard.
    const parsed = Number(value.replace(',', '.'));

    if (!Number.isFinite(parsed)) {
      setError('Bitte eine Zahl eintragen.');

      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await recordTrackingAction(
        athleteId,
        cardKey,
        parsed,
        new Date(`${day}T12:00:00`),
      );

      if (result.message) setError(result.message);
      else {
        setValue('');
        setOpen(false);
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className={`${FOCUS_RING} ${TOUCH_TARGET} flex w-fit items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted`}
      >
        <Plus aria-hidden="true" className="size-3.5" />
        {starting ? 'Startwert eintragen' : 'Wert eintragen'}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs">
        <span>Wert{unit === '' ? '' : ` in ${unit}`}</span>
        <input
          inputMode="decimal"
          value={value}
          autoFocus
          aria-label={`Wert${unit === '' ? '' : ` in ${unit}`}`}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          className={`${FOCUS_RING} ${TOUCH_FIELD} w-28 rounded-md border border-input bg-background px-2 text-base lg:text-sm`}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span>Datum</span>
        <input
          type="date"
          value={day}
          aria-label="Datum"
          onChange={(event) => {
            setDay(event.target.value);
          }}
          className={`${FOCUS_RING} ${TOUCH_FIELD} rounded-md border border-input bg-background px-2 text-base lg:text-sm`}
        />
      </label>

      <Button type="submit" variant="accent" className={TOUCH_BUTTON} disabled={pending}>
        {pending ? 'Wird gespeichert …' : 'Speichern'}
      </Button>

      <Button
        type="button"
        variant="ghost"
        className={TOUCH_BUTTON}
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
      >
        Abbrechen
      </Button>

      {error === null ? null : (
        <p role="alert" className="basis-full text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

function TrendCard({
  athleteId,
  chart,
  cardKey,
  cycle,
  onRemove,
  onNarrow,
}: {
  athleteId: string;
  chart: TrendChartView | null;
  cardKey: string;
  cycle: CycleMonthView | null;
  onRemove: () => void;
  onNarrow: (exerciseIds: readonly string[]) => void;
}) {
  const title = chart?.title ?? cardKey;

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 text-sm font-medium break-words">
          {title}
          {chart?.unit ? <span className="text-muted-foreground"> · {chart.unit}</span> : null}
        </h3>

        <button
          type="button"
          aria-label={`${title} entfernen`}
          onClick={onRemove}
          className={`${FOCUS_RING} ${TOUCH_TARGET} flex items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:text-foreground`}
        >
          <X aria-hidden="true" className="size-3.5" />
          Entfernen
        </button>
      </div>

      {chart === null ? (
        <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
          Diese Messgröße gibt es in diesem Arbeitsbereich nicht.
        </p>
      ) : chart.kind === 'cycle' ? (
        <CycleCard athleteId={athleteId} month={cycle} />
      ) : (
        <>
          {chart.exercises.length === 0 ? null : (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-xs text-muted-foreground">
                Übungen — ohne Auswahl werden alle dargestellt
              </legend>

              <div className="flex flex-wrap gap-x-4">
                {chart.exercises.map((exercise) => (
                  <label
                    key={exercise.id}
                    className={`${TOUCH_TARGET} flex min-w-0 items-center gap-2 text-sm`}
                  >
                    <input
                      type="checkbox"
                      checked={chart.exerciseIds.includes(exercise.id)}
                      onChange={(event) => {
                        onNarrow(
                          event.target.checked
                            ? [...chart.exerciseIds, exercise.id]
                            : chart.exerciseIds.filter((id) => id !== exercise.id),
                        );
                      }}
                      className="size-4 shrink-0 rounded border-input"
                    />
                    <span className="min-w-0 break-words">{exercise.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {chart.series.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              Noch nichts erfasst. Trage einen Startwert ein, damit der Verlauf irgendwo beginnt.
            </p>
          ) : (
            <ValueChart chart={chart} />
          )}

          {/* Values can be added to any card, but only where the card is not
              narrowed to particular movements: a value written here belongs to
              no lift, and filing it under one would be a claim nobody made. */}
          {chart.exerciseIds.length === 0 ? (
            <AddValue
              athleteId={athleteId}
              cardKey={cardKey}
              unit={chart.unit}
              starting={chart.series.length === 0}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

/** The palette, checked for contrast in both themes. Shape carries too. */
const SERIES = [
  { line: 'stroke-chart-1', dot: 'bg-chart-1', mark: 'rounded-full' },
  { line: 'stroke-chart-2', dot: 'bg-chart-2', mark: 'rotate-45' },
  { line: 'stroke-chart-3', dot: 'bg-chart-3', mark: 'rounded-none' },
  { line: 'stroke-chart-4', dot: 'bg-chart-4', mark: 'rounded-full border-2 bg-transparent' },
  { line: 'stroke-chart-5', dot: 'bg-chart-5', mark: 'rotate-45 border-2 bg-transparent' },
] as const;

const styleOf = (index: number) => SERIES[index % SERIES.length]!;

function ValueChart({ chart }: { chart: TrendChartView }) {
  const points = chart.series.flatMap((series) => series.points);
  const times = points.map((point) => point.at.getTime());
  const values = points.map((point) => point.value);

  const from = Math.min(...times);
  const to = Math.max(...times);
  const low = Math.min(...values);
  const high = Math.max(...values);

  // A single reading, or several on one day, would divide by zero. A flat axis
  // is the honest picture of one point.
  const spanX = to - from === 0 ? 1 : to - from;
  const spanY = high - low === 0 ? 1 : high - low;

  const x = (at: Date) => ((at.getTime() - from) / spanX) * 100;
  const y = (value: number) => 100 - ((value - low) / spanY) * 100;

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div
        role="img"
        aria-label={`${chart.title}${chart.unit === '' ? '' : ` in ${chart.unit}`}. ${String(points.length)} Werte zwischen ${day(new Date(from))} und ${day(new Date(to))}.`}
        className="relative h-40 w-full"
      >
        {/* The line is SVG; every label is HTML positioned in per cent. Text
            inside a scaled `viewBox` is 6px on a phone and 19px on a desktop —
            the same defect a browser run found on the test-overview chart. */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        >
          {chart.series.map((series, index) => (
            <polyline
              key={series.key}
              points={series.points.map((point) => `${x(point.at)},${y(point.value)}`).join(' ')}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth={2}
              className={styleOf(index).line}
            />
          ))}
        </svg>

        {chart.series.map((series, index) =>
          series.points.map((point) => (
            <span
              key={`${series.key}-${String(point.at.getTime())}-${String(point.value)}`}
              aria-hidden="true"
              style={{ left: `${String(x(point.at))}%`, top: `${String(y(point.value))}%` }}
              className={`absolute size-2 -translate-x-1/2 -translate-y-1/2 border-current ${styleOf(index).dot} ${styleOf(index).mark}`}
            />
          )),
        )}
      </div>

      <figcaption className="flex justify-between text-xs text-muted-foreground" data-numeric>
        <span>{day(new Date(from))}</span>
        <span>
          {decimal(low)} – {decimal(high)}
          {chart.unit === '' ? '' : ` ${chart.unit}`}
        </span>
        <span>{day(new Date(to))}</span>
      </figcaption>

      {chart.series.length < 2 ? null : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {chart.series.map((series, index) => (
            <li key={series.key} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden="true"
                className={`size-2 border-current ${styleOf(index).dot} ${styleOf(index).mark}`}
              />
              {series.label}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/**
 * Documented bleeding, as a month.
 *
 * The calendar and the log it feeds are one thing, so recording lives in the
 * card rather than in a section of its own. What the card does not hold is any
 * inference: no cycle length, no phase, no fertile window, no prediction. What
 * was written down is what is shown.
 *
 * The month itself is drawn by `CycleMonth`; this is the wrapper that says what
 * to do when there is no month loaded — which happens only where the card was
 * asked for in an address the page did not read a month from.
 */
function CycleCard({ month, athleteId }: { month: CycleMonthView | null; athleteId: string }) {
  if (month === null) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
        Der Monat konnte nicht geladen werden.
      </p>
    );
  }

  return <CycleMonth athleteId={athleteId} month={month} />;
}
