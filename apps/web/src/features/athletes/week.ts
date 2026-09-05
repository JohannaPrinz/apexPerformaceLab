/**
 * The week a tracking table is showing, and how it travels.
 *
 * **A plain module both sides may import**, for the same reason `trend-slots.ts`
 * is one: every export of a `'use client'` file becomes a client *reference*
 * when a Server Component imports it, so a helper shared by the page and the
 * table has to live outside both.
 *
 * ## Monday, and UTC
 *
 * The week starts on Monday — ISO-8601 and what a German-speaking coach means
 * by "diese Woche". Every date here is the **UTC midnight** of its day, which
 * is the convention the rest of the profile already reads dates in: the trend
 * charts format with `timeZone: 'UTC'`, so a day computed any other way would
 * land in a different column than it is labelled with.
 *
 * A nutrition day is a day, not a moment — what somebody ate on Tuesday is one
 * figure per quantity — so the moment inside the day carries no information and
 * is fixed at midnight rather than left to whenever the coach typed it.
 */

/** How the week is written in the address bar: `2026-08-31`. */
export const WEEK_PARAM = 'woche';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC midnight of the day a moment falls in. */
export function utcDay(moment: Date): Date {
  return new Date(
    Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate(), 0, 0, 0, 0),
  );
}

/** The Monday of the week a day falls in, at UTC midnight. */
export function startOfWeek(day: Date): Date {
  const midnight = utcDay(day);
  // `getUTCDay` counts Sunday as 0; Monday-first wants Sunday to be 6.
  const weekday = (midnight.getUTCDay() + 6) % 7;

  return new Date(midnight.getTime() - weekday * DAY_MS);
}

/** The seven days of the week beginning at `weekStart`, Monday first. */
export function weekDays(weekStart: Date): readonly Date[] {
  const monday = startOfWeek(weekStart);

  return Array.from({ length: 7 }, (_, index) => new Date(monday.getTime() + index * DAY_MS));
}

/** The week before or after, by whole weeks. */
export function shiftWeek(weekStart: Date, weeks: number): Date {
  return new Date(startOfWeek(weekStart).getTime() + weeks * 7 * DAY_MS);
}

/** `2026-08-31`, the form the address bar carries. */
export function formatWeek(weekStart: Date): string {
  return startOfWeek(weekStart).toISOString().slice(0, 10);
}

/**
 * The week an address asked for, or `null` where it asked for nothing readable.
 *
 * `null` rather than a guess: the caller decides what "no week" means, and here
 * that is the current one. A malformed parameter is treated the same way — an
 * address nobody typed by hand should not silently show a different week than
 * it names.
 */
export function parseWeek(raw: string | readonly string[] | undefined): Date | null {
  const value = raw === undefined ? '' : typeof raw === 'string' ? raw : (raw[0] ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return Number.isNaN(parsed.getTime()) ? null : startOfWeek(parsed);
}
