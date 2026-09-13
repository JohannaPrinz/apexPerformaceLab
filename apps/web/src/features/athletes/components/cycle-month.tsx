'use client';

import { useState, useTransition } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import {
  BLEEDING_INTENSITIES,
  BLEEDING_INTENSITY_FILL,
  BLEEDING_INTENSITY_LABELS_DE,
  type BleedingIntensity,
} from '@apex/domain';
import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_TARGET } from '@/components/common/touch';

import { formatMonth, MONTH_PARAM, shiftMonth } from '../month';

import type { WriteOutcome } from './writes';

/**
 * A month of documented bleeding, one mark per day.
 *
 * ## Why a month and not a list
 *
 * What a coach asks about a cycle is *when*, and a list of dates answers that
 * only after they have counted the gaps themselves. A month laid out as a month
 * puts the pattern on the screen — and it is the shape the person recording it
 * already keeps in their head.
 *
 * ## Why the mark carries strength in its fill and not only its colour
 *
 * The design system is explicit that colour never carries meaning on its own.
 * One red at four opacities is exactly the failure that rule names: in
 * greyscale, under colour-vision deficiency, or on a projector, the four
 * collapse into one. So each step differs in **fill** as well — spotting is an
 * outline, which is a different shape rather than a paler version of the same
 * one — and the legend names each step in words beside the mark it describes.
 *
 * ## What it still refuses to compute
 *
 * Cycle length, phase, a fertile window, a readiness score. The record holds
 * what was observed; a hormonal phase inferred from two dates is a claim the
 * data does not support. Adding a strength changes none of that.
 *
 * ## Entries from before the calendar
 *
 * Those are ranges — a first and a last day. They are drawn across their days
 * and marked as belonging to one entry. Clicking into one cannot split it
 * without inventing a strength for the days nobody touched, so it offers the
 * operation that does exist: removing that entry whole.
 */

export interface BleedingDayView {
  readonly date: Date;
  readonly marked: boolean;
  readonly intensity: BleedingIntensity | null;
  readonly episodeId: string | null;
  readonly partOfRange: boolean;
  readonly note: string | null;
  readonly recordedBy: 'ATHLETE' | 'COACH' | null;
}

export interface CycleMonthView {
  readonly month: Date;
  readonly days: readonly BleedingDayView[];
}

const monthName = (value: Date): string =>
  new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    value,
  );

const longDate = (value: Date): string =>
  new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'UTC' }).format(value);

/** Monday first, matching the week tables and ISO-8601. */
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

const isoDay = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * The mark for one day.
 *
 * A ring always, so an unmarked day is still a target with a visible edge, and
 * a fill whose height says how strong it was. Height rather than opacity: a
 * partly filled circle survives greyscale, which a 35% red does not.
 */
function Mark({ intensity, marked }: { intensity: BleedingIntensity | null; marked: boolean }) {
  if (!marked) {
    return (
      <span
        aria-hidden="true"
        className="size-5 rounded-full border border-dashed border-border-strong/50"
      />
    );
  }

  // A documented day whose strength was never stated — every entry from before
  // the calendar. Drawn as a full ring with a dot, so it is visibly recorded
  // and visibly not one of the four steps.
  if (intensity === null) {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 items-center justify-center rounded-full border-2 border-destructive"
      >
        <span className="size-1.5 rounded-full bg-destructive" />
      </span>
    );
  }

  const fill = BLEEDING_INTENSITY_FILL[intensity];

  return (
    <span
      aria-hidden="true"
      className="relative size-5 overflow-hidden rounded-full border-2 border-destructive"
    >
      <span
        className="absolute inset-x-0 bottom-0 bg-destructive"
        style={{ height: `${String(Math.round(fill * 100))}%` }}
      />
    </span>
  );
}

/**
 * Marking a day, and taking a multi-day entry back.
 *
 * As everywhere in this family: no athlete is named. The coach's page binds an
 * id, the portal resolves one from the session (§21).
 */
export interface CycleWrites {
  readonly setDay: (day: string, intensity: BleedingIntensity | null) => Promise<WriteOutcome>;
  readonly removeRange: (episodeId: string) => Promise<WriteOutcome>;
}

export function CycleMonth({
  month,
  writes,
  readOnly = false,
}: {
  readonly month: CycleMonthView;
  readonly writes: CycleWrites;
  /**
   * A deactivated athlete's portal: the month stays readable, the editing goes.
   *
   * The marks remain — what was documented is exactly what such an account is
   * still entitled to see. What goes is the day becoming a button that opens an
   * editor nothing can save. Defaults to false, so the coach's page is
   * unchanged, and `writable()` still refuses in the procedure regardless.
   */
  readonly readOnly?: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** Which day's panel is open, as its ISO date. One at a time. */
  const [openDay, setOpenDay] = useState<string | null>(null);

  const goto = (months: number) => {
    const params = new URLSearchParams(search.toString());
    params.set(MONTH_PARAM, formatMonth(shiftMonth(month.month, months)));
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const write = (day: BleedingDayView, intensity: BleedingIntensity | null) => {
    setError(null);
    startTransition(async () => {
      const result = await writes.setDay(isoDay(day.date), intensity);
      if (result.message) setError(result.message);
      else {
        setOpenDay(null);
        router.refresh();
      }
    });
  };

  const removeRange = (episodeId: string) => {
    setError(null);

    startTransition(async () => {
      const result = await writes.removeRange(episodeId);
      if (result.message) setError(result.message);
      else {
        setOpenDay(null);
        router.refresh();
      }
    });
  };

  const first = month.days[0]?.date ?? month.month;
  // `getUTCDay` counts Sunday as 0; a Monday-first grid wants Sunday to be 6.
  const lead = (first.getUTCDay() + 6) % 7;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium" data-numeric>
          {monthName(month.month)}
        </p>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className={TOUCH_BUTTON}
            aria-label="Vorheriger Monat"
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
            aria-label="Nächster Monat"
            onClick={() => {
              goto(1);
            }}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      <div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
          {WEEKDAYS.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {/* The days of the previous month, as gaps rather than as numbers: a
              grid that started on the 1st in the wrong column would put every
              weekday under the wrong heading. */}
          {Array.from({ length: lead }, (_, index) => (
            <span key={`lead-${String(index)}`} />
          ))}

          {month.days.map((day) => {
            const iso = isoDay(day.date);
            const label = day.marked
              ? day.intensity === null
                ? 'dokumentiert, ohne Stärke'
                : BLEEDING_INTENSITY_LABELS_DE[day.intensity]
              : 'nichts dokumentiert';

            return readOnly ? (
              <div
                key={iso}
                // Still the whole statement: a mark is a shape, and a screen
                // reader cannot see how full it is.
                aria-label={`${longDate(day.date)} — ${label}`}
                className={`${TOUCH_TARGET} flex flex-col items-center justify-center gap-0.5 rounded-md py-1`}
              >
                <span className="text-[11px] text-muted-foreground" data-numeric>
                  {day.date.getUTCDate()}
                </span>
                <Mark intensity={day.intensity} marked={day.marked} />
              </div>
            ) : (
              <button
                key={iso}
                type="button"
                disabled={pending}
                aria-expanded={openDay === iso}
                // The whole statement, because the mark is a shape and a
                // screen reader cannot see how full it is.
                aria-label={`${longDate(day.date)} — ${label}`}
                onClick={() => {
                  setOpenDay((previous) => (previous === iso ? null : iso));
                }}
                className={`${FOCUS_RING} ${TOUCH_TARGET} flex flex-col items-center justify-center gap-0.5 rounded-md py-1 hover:bg-muted disabled:opacity-50 ${
                  openDay === iso ? 'bg-muted ring-1 ring-border-strong' : ''
                }`}
              >
                <span className="text-[11px] text-muted-foreground" data-numeric>
                  {day.date.getUTCDate()}
                </span>
                <Mark intensity={day.intensity} marked={day.marked} />
              </button>
            );
          })}
        </div>
      </div>

      {/* The panel below the grid, not floating over it: a popover on a
          five-column-wide cell would cover the days either side of the one
          being changed. */}
      {openDay === null
        ? null
        : (() => {
            const day = month.days.find((entry) => isoDay(entry.date) === openDay);
            if (day === undefined) return null;

            if (day.partOfRange) {
              return (
                <div className="flex flex-col gap-2 rounded-md border border-border bg-muted p-3 text-xs">
                  <p className="text-pretty">
                    <span className="font-medium">{longDate(day.date)}</span> gehört zu einem
                    mehrtägigen Eintrag. Einzelne Tage daraus lassen sich nicht ändern — sonst
                    müsste für die übrigen Tage eine Stärke erfunden werden, die niemand
                    dokumentiert hat.
                  </p>
                  {day.episodeId === null ? null : (
                    <Button
                      type="button"
                      variant="outline"
                      className={`${TOUCH_BUTTON} w-fit`}
                      disabled={pending}
                      onClick={() => {
                        removeRange(day.episodeId ?? '');
                      }}
                    >
                      Ganzen Eintrag entfernen
                    </Button>
                  )}
                </div>
              );
            }

            return (
              <div
                role="group"
                aria-label={`Stärke für ${longDate(day.date)}`}
                className="flex flex-col gap-2 rounded-md border border-border bg-muted p-3"
              >
                <p className="text-xs font-medium" data-numeric>
                  {longDate(day.date)}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {BLEEDING_INTENSITIES.map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={pending}
                      aria-pressed={day.intensity === key}
                      onClick={() => {
                        write(day, key);
                      }}
                      className={`${FOCUS_RING} ${TOUCH_TARGET} flex items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors disabled:opacity-50 ${
                        day.intensity === key
                          ? 'border-destructive bg-background font-medium'
                          : 'border-border hover:bg-background'
                      }`}
                    >
                      <Mark intensity={key} marked />
                      {BLEEDING_INTENSITY_LABELS_DE[key]}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={pending || !day.marked}
                    onClick={() => {
                      write(day, null);
                    }}
                    className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-md border border-border px-2.5 text-xs hover:bg-background disabled:opacity-40`}
                  >
                    Nichts
                  </button>
                </div>

                {day.note === null ? null : (
                  <p className="text-xs text-pretty text-muted-foreground">{day.note}</p>
                )}
                {day.recordedBy === null ? null : (
                  <p className="text-[10px] text-muted-foreground">
                    {day.recordedBy === 'ATHLETE' ? 'Vom Athleten' : 'Vom Coach'} dokumentiert
                  </p>
                )}
              </div>
            );
          })()}

      {/* The legend. Colour never carries meaning alone, so each step is shown
          as the mark it actually is, beside its name. */}
      <div className="flex flex-col gap-1.5 border-t border-border pt-2">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Legende
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {BLEEDING_INTENSITIES.map((key) => (
            <li key={key} className="flex items-center gap-1.5 text-xs">
              <Mark intensity={key} marked />
              {BLEEDING_INTENSITY_LABELS_DE[key]}
            </li>
          ))}
          <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mark intensity={null} marked />
            Ohne Stärke
          </li>
        </ul>
      </div>

      <p className="text-xs text-pretty text-muted-foreground">
        Einen Tag antippen und die Stärke wählen. Es wird nichts daraus abgeleitet — weder eine
        Zyklusphase noch eine Aussage zur Leistung.
      </p>

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
