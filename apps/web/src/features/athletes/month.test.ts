import { describe, expect, it } from 'vitest';

import { formatMonth, parseMonth, shiftMonth, startOfMonth } from './month';

/**
 * The month arithmetic behind the cycle calendar.
 *
 * Worth its own file for one reason: month arithmetic done by adding days is
 * wrong in a way nobody notices until a 31st, and wrong in local time in a way
 * nobody notices until a clock change.
 */

const at = (iso: string) => new Date(iso);

describe('where a month begins', () => {
  it('takes the first, at UTC midnight', () => {
    expect(startOfMonth(at('2026-03-17T22:45:00.000Z'))).toEqual(at('2026-03-01T00:00:00.000Z'));
  });
});

describe('paging', () => {
  it('moves a whole month back', () => {
    expect(shiftMonth(at('2026-03-01T00:00:00.000Z'), -1)).toEqual(at('2026-02-01T00:00:00.000Z'));
  });

  it('crosses a year boundary', () => {
    expect(shiftMonth(at('2026-01-01T00:00:00.000Z'), -1)).toEqual(at('2025-12-01T00:00:00.000Z'));
    expect(shiftMonth(at('2026-12-01T00:00:00.000Z'), 1)).toEqual(at('2027-01-01T00:00:00.000Z'));
  });

  it('does not skip February from a 31st', () => {
    // The classic bug: "31 January plus one month" computed by adding days
    // lands in March. Building from year and month cannot.
    expect(shiftMonth(at('2026-01-31T00:00:00.000Z'), 1)).toEqual(at('2026-02-01T00:00:00.000Z'));
  });

  it('crosses a daylight-saving boundary without drifting', () => {
    // Central European clocks go back on 2026-10-25. Everything here is UTC.
    expect(shiftMonth(at('2026-10-01T00:00:00.000Z'), 1)).toEqual(at('2026-11-01T00:00:00.000Z'));
  });
});

describe('the month in the address bar', () => {
  it('writes the first, whatever day it is given', () => {
    expect(formatMonth(at('2026-03-17T13:00:00.000Z'))).toBe('2026-03-01');
  });

  it('reads a month back, normalised to its first', () => {
    expect(parseMonth('2026-03-17')).toEqual(at('2026-03-01T00:00:00.000Z'));
  });

  it('answers null for anything it cannot read', () => {
    for (const raw of [undefined, '', 'heute', '2026-3-01', '01.03.2026']) {
      expect(parseMonth(raw)).toBeNull();
    }
  });

  it('takes the first of a repeated parameter', () => {
    expect(parseMonth(['2026-03-01', '2026-04-01'])).toEqual(at('2026-03-01T00:00:00.000Z'));
  });
});
