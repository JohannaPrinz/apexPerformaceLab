'use client';

import { useState, useTransition } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_TARGET } from '@/components/common/touch';

import { clearNutritionValueAction, setNutritionValueAction } from '../server/actions';
import { formatWeek, shiftWeek, WEEK_PARAM } from '../week';

/**
 * One week of what an athlete ate and drank.
 *
 * ## Why a table and not a curve
 *
 * Five quantities move together — a day's protein is read beside that day's
 * carbohydrate and fat, and the energy total only exists because all three are
 * there. Five separate charts would put the one comparison that matters on five
 * different screens. A week is the span a coach and an athlete actually talk
 * in, and it fits across a row without scrolling on a laptop.
 *
 * ## Why the week is in the address bar
 *
 * The same reason the cards are: what a coach is looking at survives a reload
 * and can be sent to a colleague, and it needs no column. It is also the only
 * place a server-rendered table can read a choice from without a round trip
 * through client state.
 *
 * ## What is computed
 *
 * The energy of each day, from the three macronutrients by the published
 * factors, and the plain mean of the days that carry a value. **Every average
 * says how many days it is drawn from**, because a mean over three days is not
 * a week. Nothing here compares the figures with a requirement, marks them, or
 * calls them anything — how much a person should eat is a judgement about that
 * person, and the record holds no basis for one.
 *
 * ## Who may write
 *
 * The coach, today. The entries carry `recordedBy` and the table shows it, so
 * an athlete's own figures are distinguishable from a coach's the moment the
 * athlete portal exists (§21) — it does not yet, so there is no athlete path
 * here to pretend otherwise with.
 */

export interface NutritionQuantityView {
  readonly key: string;
  readonly name: string;
  readonly unit: string;
}

export interface NutritionCellView {
  readonly entryId: string;
  readonly value: number;
  readonly recordedBy: 'ATHLETE' | 'COACH';
}

export interface NutritionDayView {
  readonly date: Date;
  readonly values: Readonly<Record<string, NutritionCellView | undefined>>;
  readonly energyKcal: number | null;
}

export interface NutritionAverageView {
  readonly value: number;
  readonly days: number;
}

export interface NutritionWeekView {
  readonly weekStart: Date;
  readonly quantities: readonly NutritionQuantityView[];
  readonly days: readonly NutritionDayView[];
  readonly averages: Readonly<Record<string, NutritionAverageView | undefined>>;
  readonly energyAverage: NutritionAverageView | null;
}

const weekday = (value: Date): string =>
  new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' }).format(value);

const shortDate = (value: Date): string =>
  new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(
    value,
  );

const longDate = (value: Date): string =>
  new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'UTC' }).format(value);

const decimal = (value: number, digits = 1): string =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }).format(value);

/** The value as it belongs in an input: a German decimal comma, or empty. */
const forInput = (cell: NutritionCellView | undefined): string =>
  cell === undefined ? '' : decimal(cell.value, 2);

export function NutritionWeek({
  athleteId,
  week,
  onRemove,
}: {
  readonly athleteId: string;
  readonly week: NutritionWeekView;
  readonly onRemove: () => void;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const goto = (weeks: number) => {
    const params = new URLSearchParams(search.toString());
    params.set(WEEK_PARAM, formatWeek(shiftWeek(week.weekStart, weeks)));
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const last = week.days.at(-1);

  return (
    <section
      aria-labelledby="nutrition-week"
      className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id="nutrition-week" className="text-sm font-medium">
            Ernährung
          </h3>
          <p className="text-xs text-muted-foreground" data-numeric>
            {longDate(week.weekStart)}
            {last === undefined ? '' : ` – ${longDate(last.date)}`}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className={TOUCH_BUTTON}
            aria-label="Vorherige Woche"
            onClick={() => {
              goto(-1);
            }}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={TOUCH_BUTTON}
            aria-label="Nächste Woche"
            onClick={() => {
              goto(1);
            }}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
          <button
            type="button"
            aria-label="Ernährung entfernen"
            onClick={onRemove}
            className={`${FOCUS_RING} ${TOUCH_TARGET} flex items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:text-foreground`}
          >
            <X aria-hidden="true" className="size-3.5" />
            Entfernen
          </button>
        </div>
      </div>

      {week.quantities.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
          In diesem Arbeitsbereich gibt es keine Ernährungs-Messgrößen.
        </p>
      ) : (
        /* Its own scroller: six columns of numbers do not fit a 375px screen,
           and the page body must never scroll sideways because of one table. */
        <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <caption className="sr-only">
              Ernährung je Tag der Woche ab {longDate(week.weekStart)}
            </caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="py-2 pr-3 text-xs font-medium text-muted-foreground">
                  Tag
                </th>
                {week.quantities.map((quantity) => (
                  <th
                    key={quantity.key}
                    scope="col"
                    className="px-1.5 py-2 text-xs font-medium text-muted-foreground"
                  >
                    {quantity.name}
                    {quantity.unit === '' ? null : (
                      <span className="block font-normal">{quantity.unit}</span>
                    )}
                  </th>
                ))}
                <th
                  scope="col"
                  className="px-1.5 py-2 text-right text-xs font-medium text-muted-foreground"
                >
                  Gesamtkalorien
                  <span className="block font-normal">kcal</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {week.days.map((day) => (
                <tr key={day.date.toISOString()} className="border-b border-border/60">
                  <th scope="row" className="py-1 pr-3 text-left font-normal whitespace-nowrap">
                    <span className="text-xs text-muted-foreground">{weekday(day.date)}</span>{' '}
                    <span data-numeric>{shortDate(day.date)}</span>
                  </th>

                  {week.quantities.map((quantity) => (
                    <td key={quantity.key} className="px-1.5 py-1">
                      <Cell
                        athleteId={athleteId}
                        day={day.date}
                        quantity={quantity}
                        cell={day.values[quantity.key]}
                        onError={setError}
                      />
                    </td>
                  ))}

                  {/* Computed, so no field: a box beside it would invite a
                      coach to disagree with the arithmetic. */}
                  <td className="px-1.5 py-1 text-right" data-numeric>
                    {day.energyKcal === null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      decimal(day.energyKcal, 0)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-border">
                <th scope="row" className="py-2 pr-3 text-left text-xs font-medium">
                  Durchschnitt
                </th>

                {week.quantities.map((quantity) => {
                  const average = week.averages[quantity.key];

                  return (
                    <td key={quantity.key} className="px-1.5 py-2 text-xs" data-numeric>
                      {average === undefined ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          <span className="font-medium">{decimal(average.value)}</span>{' '}
                          {/* How many days the mean is drawn from. A mean over
                              three days is not a week, and a bare number would
                              be read as one. */}
                          <span className="text-muted-foreground">
                            aus {average.days} {average.days === 1 ? 'Tag' : 'Tagen'}
                          </span>
                        </>
                      )}
                    </td>
                  );
                })}

                <td className="px-1.5 py-2 text-right text-xs" data-numeric>
                  {week.energyAverage === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <>
                      <span className="font-medium">{decimal(week.energyAverage.value, 0)}</span>{' '}
                      <span className="text-muted-foreground">
                        aus {week.energyAverage.days}{' '}
                        {week.energyAverage.days === 1 ? 'Tag' : 'Tagen'}
                      </span>
                    </>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-pretty text-muted-foreground">
        Die Gesamtkalorien folgen aus Eiweiß, Kohlenhydraten und Fetten (4 · 4 · 9 kcal/g).
        Ballaststoffe und Trinkmenge gehen nicht in die Summe ein. Es findet keine fachliche
        Bewertung statt.
      </p>

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * One cell.
 *
 * Written on blur rather than on every keystroke: a coach typing "150" would
 * otherwise store 1, then 15, then 150, and each of those is a saved figure
 * about somebody's day. Emptying the field removes the entry — which is a
 * different act from writing a zero, and the two must not collapse: a day with
 * no protein figure is a day nobody wrote down, a day with 0 g is a statement.
 */
function Cell({
  athleteId,
  day,
  quantity,
  cell,
  onError,
}: {
  readonly athleteId: string;
  readonly day: Date;
  readonly quantity: NutritionQuantityView;
  readonly cell: NutritionCellView | undefined;
  readonly onError: (message: string | null) => void;
}) {
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState(() => forInput(cell));
  /** What the field held when it was last in step with the record. */
  const [saved, setSaved] = useState(() => forInput(cell));

  // A value written elsewhere — another cell's save refreshes the page — must
  // reach a field the coach is not editing.
  const current = forInput(cell);
  if (current !== saved && draft === saved) {
    setSaved(current);
    setDraft(current);
  }

  const commit = () => {
    if (draft.trim() === saved.trim()) return;
    onError(null);

    if (draft.trim() === '') {
      if (cell === undefined) return;

      startTransition(async () => {
        const result = await clearNutritionValueAction(athleteId, cell.entryId);
        if (result.message) onError(result.message);
        else setSaved('');
      });

      return;
    }

    // A German keyboard produces a comma, and refusing that would be refusing
    // the coach's own keyboard.
    const parsed = Number(draft.replace(',', '.'));

    if (!Number.isFinite(parsed) || parsed < 0) {
      onError(`${quantity.name}: bitte eine Zahl eintragen.`);
      setDraft(saved);

      return;
    }

    startTransition(async () => {
      const result = await setNutritionValueAction(athleteId, quantity.key, day, parsed);
      if (result.message) onError(result.message);
      else setSaved(draft);
    });
  };

  return (
    <input
      inputMode="decimal"
      value={draft}
      aria-label={`${quantity.name} am ${longDate(day)}${
        quantity.unit === '' ? '' : ` in ${quantity.unit}`
      }`}
      // Where the figure came from. §13 keeps a self-report and a coach's entry
      // apart, and this is the only place the difference can be seen.
      title={
        cell === undefined
          ? undefined
          : cell.recordedBy === 'ATHLETE'
            ? 'Vom Athleten eingetragen'
            : 'Vom Coach eingetragen'
      }
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className={`${FOCUS_RING} h-11 w-full min-w-16 rounded-md border bg-background px-2 text-right text-sm ${
        cell?.recordedBy === 'ATHLETE' ? 'border-accent/60' : 'border-input'
      }`}
      data-numeric
    />
  );
}
