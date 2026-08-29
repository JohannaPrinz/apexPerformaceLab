'use client';

import { useState, useTransition } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { Plus, X } from 'lucide-react';

import { Badge, Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';
import { recordBleedingAction, removeBleedingAction } from '@/features/cycle/server/actions';

import { recordTrackingAction, setTrendCardAction } from '../server/actions';
import { encodeTrendCards, type TrendCardSelection } from '../trend-slots';

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
  readonly kind: 'measurement' | 'cycle';
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
  readonly kind: 'measurement' | 'cycle';
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

const day = (value: Date): string =>
  new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeZone: 'UTC' }).format(value);

const longDay = (value: Date): string =>
  new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' }).format(value);

const decimal = (value: number): string =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value);

export function TrendCards({
  athleteId,
  options,
  charts,
  cards,
}: {
  athleteId: string;
  options: readonly TrendOptionView[];
  /** One entry per card, in the same order. */
  charts: readonly (TrendChartView | null)[];
  cards: readonly TrendCardSelection[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [adding, setAdding] = useState(false);

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

  return (
    <section aria-labelledby="trends" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="trends" className="text-lg font-semibold">
            Verlauf
          </h2>
          <p className="text-sm text-muted-foreground">
            Dargestellt wird, was erfasst wurde — es findet keine fachliche Bewertung statt.
          </p>
        </div>

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
        /* One column on a phone, two from `md`: two charts sharing a 375px row
           would be two illegible charts. */
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card, index) => (
            <TrendCard
              key={`${card.key}-${String(index)}`}
              athleteId={athleteId}
              chart={charts[index] ?? null}
              cardKey={card.key}
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
          ))}
        </div>
      )}
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
  onRemove,
  onNarrow,
}: {
  athleteId: string;
  chart: TrendChartView | null;
  cardKey: string;
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
        <CycleCard athleteId={athleteId} chart={chart} />
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
 * Documented bleeding: the list, and the way to add to it.
 *
 * Recording lives **in** the card rather than in a section of its own, because
 * a log and the entry that feeds it are one thing. What it does not hold is any
 * inference: no cycle length, no phase, no fertile window, no prediction. What
 * was written down is what is shown.
 */
function CycleCard({ athleteId, chart }: { athleteId: string; chart: TrendChartView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [startedOn, setStartedOn] = useState('');
  const [endedOn, setEndedOn] = useState('');
  const [note, setNote] = useState('');

  const run = (work: () => Promise<{ message?: string }>, clear = false) => {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.message) {
        setError(result.message);

        return;
      }

      if (clear) {
        setStartedOn('');
        setEndedOn('');
        setNote('');
      }

      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Dokumentierte Blutungen. Der erste Tag genügt; Ende und Notiz sind optional. Es wird nichts
        daraus abgeleitet — weder eine Zyklusphase noch eine Aussage zur Leistung.
      </p>

      <form
        aria-label="Blutung dokumentieren"
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData();
          form.set('athleteId', athleteId);
          form.set('startedOn', startedOn);
          form.set('endedOn', endedOn);
          form.set('note', note);

          run(() => recordBleedingAction({ status: 'idle' }, form), true);
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Erster Tag
            <input
              type="date"
              required
              value={startedOn}
              onChange={(event) => {
                setStartedOn(event.target.value);
              }}
              className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-2 text-sm`}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium">
            Letzter Tag <span className="font-normal text-muted-foreground">· optional</span>
            <input
              type="date"
              value={endedOn}
              onChange={(event) => {
                setEndedOn(event.target.value);
              }}
              className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-2 text-sm`}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium">
          Notiz <span className="font-normal text-muted-foreground">· optional</span>
          <input
            type="text"
            maxLength={1000}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
            className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-2 text-sm`}
          />
        </label>

        {error === null ? null : (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={pending} className={TOUCH_BUTTON}>
            {pending ? 'Wird gespeichert …' : 'Blutung dokumentieren'}
          </Button>
        </div>
      </form>

      {chart.episodes.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          Noch nichts dokumentiert.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {chart.episodes.map((episode) => (
            <li
              key={episode.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border p-2 text-xs"
            >
              <span className="font-medium">{longDay(episode.startedOn)}</span>
              <span className="text-muted-foreground">
                {episode.endedOn === null
                  ? 'Ende nicht dokumentiert'
                  : `bis ${longDay(episode.endedOn)}`}
              </span>
              <Badge variant="secondary">
                {episode.recordedBy === 'ATHLETE' ? 'Vom Athleten' : 'Vom Coach'}
              </Badge>

              {episode.note === null ? null : (
                <span className="min-w-0 basis-full break-words text-muted-foreground">
                  {episode.note}
                </span>
              )}

              {/* Removable, unlike a measurement: a date entered on the wrong
                  day is a slip, not a finding that has to survive in a
                  supersede chain. */}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const form = new FormData();
                  form.set('episodeId', episode.id);

                  run(() => removeBleedingAction(athleteId, { status: 'idle' }, form));
                }}
                className={`${FOCUS_RING} ${TOUCH_TARGET} ml-auto rounded px-2 text-muted-foreground hover:text-foreground`}
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
