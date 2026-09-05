import { describe, expect, it } from 'vitest';

import { formatWeek, parseWeek, shiftWeek, startOfWeek, utcDay, weekDays } from './week';

/**
 * The week arithmetic behind the tracking table.
 *
 * Worth its own file because every bug here is invisible: a week that starts on
 * Sunday still shows seven days, and a day computed in local time still shows a
 * date — just not the one the value was recorded under.
 */

const at = (iso: string) => new Date(iso);

describe('which day a moment belongs to', () => {
  it('takes the UTC midnight of the day', () => {
    expect(utcDay(at('2026-08-31T22:45:00.000Z'))).toEqual(at('2026-08-31T00:00:00.000Z'));
  });
});

describe('where a week begins', () => {
  it('starts on Monday', () => {
    // 2026-09-02 is a Wednesday.
    expect(startOfWeek(at('2026-09-02T00:00:00.000Z'))).toEqual(at('2026-08-31T00:00:00.000Z'));
  });

  it('treats Sunday as the last day of the week, not the first', () => {
    // The classic off-by-one: `getUTCDay()` calls Sunday 0, so an unshifted
    // calculation would move a Sunday forward into the coming week.
    expect(startOfWeek(at('2026-09-06T00:00:00.000Z'))).toEqual(at('2026-08-31T00:00:00.000Z'));
  });

  it('leaves a Monday where it is', () => {
    expect(startOfWeek(at('2026-08-31T00:00:00.000Z'))).toEqual(at('2026-08-31T00:00:00.000Z'));
  });
});

describe('the seven days', () => {
  it('runs Monday to Sunday', () => {
    const days = weekDays(at('2026-09-02T00:00:00.000Z'));

    expect(days).toHaveLength(7);
    expect(days[0]).toEqual(at('2026-08-31T00:00:00.000Z'));
    expect(days[6]).toEqual(at('2026-09-06T00:00:00.000Z'));
  });
});

describe('paging', () => {
  it('moves a whole week back', () => {
    expect(shiftWeek(at('2026-08-31T00:00:00.000Z'), -1)).toEqual(at('2026-08-24T00:00:00.000Z'));
  });

  it('crosses a month boundary without drifting', () => {
    expect(shiftWeek(at('2026-08-31T00:00:00.000Z'), 1)).toEqual(at('2026-09-07T00:00:00.000Z'));
  });

  it('crosses a daylight-saving boundary without drifting', () => {
    // Central European clocks go back on 2026-10-25. Everything here is UTC, so
    // the week must still be exactly seven days — this is the assertion that
    // fails the moment somebody reaches for a local-time date.
    expect(shiftWeek(at('2026-10-19T00:00:00.000Z'), 1)).toEqual(at('2026-10-26T00:00:00.000Z'));
  });
});

describe('the week in the address bar', () => {
  it('writes the Monday, whatever day it is given', () => {
    expect(formatWeek(at('2026-09-04T13:00:00.000Z'))).toBe('2026-08-31');
  });

  it('reads a week back', () => {
    expect(parseWeek('2026-08-31')).toEqual(at('2026-08-31T00:00:00.000Z'));
  });

  it('normalises a mid-week date to its Monday', () => {
    expect(parseWeek('2026-09-04')).toEqual(at('2026-08-31T00:00:00.000Z'));
  });

  it('answers null for anything it cannot read', () => {
    // Not a guess: an address nobody typed by hand must not quietly show a
    // different week than it names.
    for (const raw of [undefined, '', 'heute', '2026-8-31', '31.08.2026']) {
      expect(parseWeek(raw)).toBeNull();
    }
  });

  it('takes the first of a repeated parameter', () => {
    expect(parseWeek(['2026-08-31', '2026-09-07'])).toEqual(at('2026-08-31T00:00:00.000Z'));
  });
});
