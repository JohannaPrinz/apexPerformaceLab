/**
 * The month a calendar card is showing, and how it travels.
 *
 * A plain module both sides may import, for the same reason `week.ts` and
 * `trend-slots.ts` are: every export of a `'use client'` file becomes a client
 * *reference* when a Server Component imports it, so a helper shared by the
 * page and the calendar has to live outside both.
 *
 * Every date here is the **UTC midnight** of its day, which is what a `DATE`
 * column stores and returns. A month computed in local time would put the first
 * of the month in the previous one for anyone west of Greenwich.
 */

/** How the month is written in the address bar: `2026-03-01`. */
export const MONTH_PARAM = 'monat';

/** The first of the month a day falls in, at UTC midnight. */
export function startOfMonth(day: Date): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
}

/**
 * The month before or after.
 *
 * Built from the year and month rather than by adding days, so a 31st never
 * lands in the month after the one it was aiming for — the classic bug of
 * "31 January plus one month".
 */
export function shiftMonth(month: Date, months: number): Date {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + months, 1));
}

/** `2026-03-01`, the form the address bar carries. */
export function formatMonth(month: Date): string {
  return startOfMonth(month).toISOString().slice(0, 10);
}

/**
 * The month an address asked for, or `null` where it asked for nothing
 * readable.
 *
 * `null` rather than a guess: the caller decides what "no month" means, and
 * there that is the current one. A malformed parameter is treated the same
 * way — an address nobody typed by hand should not silently show a different
 * month than it names.
 */
export function parseMonth(raw: string | readonly string[] | undefined): Date | null {
  const value = raw === undefined ? '' : typeof raw === 'string' ? raw : (raw[0] ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return Number.isNaN(parsed.getTime()) ? null : startOfMonth(parsed);
}
