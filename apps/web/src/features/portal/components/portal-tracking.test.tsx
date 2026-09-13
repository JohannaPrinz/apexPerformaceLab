import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  BiofeedbackWeek,
  CycleMonth,
  NutritionWeek,
  type BiofeedbackWeekView,
  type CycleMonthView,
  type NutritionWeekView,
} from '@/features/athletes';

/**
 * What a deactivated athlete's tracking still offers (§21).
 *
 * A deactivated account keeps the portal and loses the writes. The tables used
 * to show live fields anyway: the athlete typed a value, the procedure refused
 * it with `writable()`, and the refusal arrived after the typing. That is the
 * rule `PortalTracking` already states for the coach-only controls — *a control
 * the athlete cannot use is still a control they can be confused by* — applied
 * to the one case that had been left out.
 *
 * Both halves matter and both are asserted here:
 *
 * 1. **Read-only shows the values and no fields.** Not an empty table — what
 *    was recorded is exactly what such an account is still entitled to read.
 * 2. **The coach's page is untouched.** `readOnly` defaults to false, so the
 *    same components rendered the way the coach's page renders them must still
 *    have every field they had.
 *
 * The tables are exercised directly rather than through `PortalTracking`,
 * because that wrapper binds server actions and this is about markup.
 */

// The athletes barrel reaches the Prisma client at import time. Nothing here
// touches a database — these are three tables and their markup.
vi.mock('@apex/database', () => ({ db: {} }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const MONDAY = new Date('2026-09-07T00:00:00.000Z');
const days = Array.from({ length: 7 }, (_, index) => {
  const day = new Date(MONDAY);
  day.setUTCDate(MONDAY.getUTCDate() + index);

  return day;
});

const nutrition: NutritionWeekView = {
  weekStart: MONDAY,
  quantities: [{ key: 'protein', name: 'Eiweiß', unit: 'g' }],
  days: days.map((date, index) => ({
    date,
    energyKcal: null,
    values:
      index === 0
        ? { protein: { entryId: 'ent_1', value: 120, recordedBy: 'ATHLETE' as const } }
        : {},
  })),
  averages: { protein: { value: 120, days: 1 } },
  energyAverage: null,
};

const biofeedback: BiofeedbackWeekView = {
  weekStart: MONDAY,
  rows: [
    {
      quantity: { key: 'sleep_quality', name: 'Schlafqualität', unit: '', ownedByWorkspace: false },
      cells: days.map((_day, index) =>
        index === 0
          ? { entryId: 'ent_2', value: 4, note: 'Kurz geschlafen', recordedBy: 'ATHLETE' as const }
          : null,
      ),
      average: { value: 4, days: 1 },
    },
  ],
  days,
  available: [],
};

const cycle: CycleMonthView = {
  month: new Date('2026-09-01T00:00:00.000Z'),
  days: Array.from({ length: 30 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 8, index + 1)),
    marked: index === 3,
    intensity: index === 3 ? ('MEDIUM' as const) : null,
    episodeId: index === 3 ? 'ep_1' : null,
    partOfRange: false,
    note: null,
    recordedBy: index === 3 ? ('ATHLETE' as const) : null,
  })),
};

const nutritionWrites = {
  setValue: vi.fn(() => Promise.resolve({})),
  clearValue: vi.fn(() => Promise.resolve({})),
};
const biofeedbackWrites = {
  setValue: vi.fn(() => Promise.resolve({})),
  clearValue: vi.fn(() => Promise.resolve({})),
  setNote: vi.fn(() => Promise.resolve({})),
};
const cycleWrites = {
  setDay: vi.fn(() => Promise.resolve({})),
  removeRange: vi.fn(() => Promise.resolve({})),
};

describe('the nutrition week of a deactivated athlete', () => {
  it('offers no field to type into', () => {
    render(<NutritionWeek week={nutrition} writes={nutritionWrites} readOnly />);

    expect(screen.queryAllByRole('textbox')).toEqual([]);
    expect(screen.queryByLabelText(/Eiweiß am/u)).toBeNull();
  });

  it('still shows what was recorded', () => {
    // Read-only is not an empty table: the values are what the account may read.
    render(<NutritionWeek week={nutrition} writes={nutritionWrites} readOnly />);

    // Twice over: the cell and the week's average below it.
    expect(screen.getAllByText('120').length).toBeGreaterThan(0);
  });

  it('keeps every field on the coach’s page', () => {
    render(<NutritionWeek week={nutrition} writes={nutritionWrites} />);

    // One field per day of the week.
    expect(screen.getAllByLabelText(/Eiweiß am/u).length).toBeGreaterThanOrEqual(7);
  });
});

describe('the biofeedback week of a deactivated athlete', () => {
  it('offers no field and no remark button', () => {
    render(<BiofeedbackWeek week={biofeedback} writes={biofeedbackWrites} readOnly />);

    expect(screen.queryAllByRole('textbox')).toEqual([]);
    expect(screen.queryByRole('button', { name: /bemerk/iu })).toBeNull();
  });

  it('still shows the value and the remark that belongs to it', () => {
    // The remark travelled with the value; hiding it would lose a reading.
    render(<BiofeedbackWeek week={biofeedback} writes={biofeedbackWrites} readOnly />);

    expect(screen.getAllByText('4').length).toBeGreaterThan(0);
    expect(screen.getByText('Kurz geschlafen')).toBeTruthy();
  });

  it('keeps every field on the coach’s page', () => {
    render(<BiofeedbackWeek week={biofeedback} writes={biofeedbackWrites} />);

    expect(screen.getAllByLabelText(/Schlafqualität am/u).length).toBeGreaterThanOrEqual(7);
  });
});

describe('the cycle month of a deactivated athlete', () => {
  it('turns the days into readings rather than buttons', () => {
    render(<CycleMonth month={cycle} writes={cycleWrites} readOnly />);

    // The month and year navigation stays — reading a different month is
    // reading. What goes is the day that opens an editor nothing can save.
    expect(screen.queryByRole('button', { name: /^4\. September 2026/u })).toBeNull();
  });

  it('still shows what was documented', () => {
    render(<CycleMonth month={cycle} writes={cycleWrites} readOnly />);

    expect(screen.getByLabelText(/^4\. September 2026 — /u)).toBeTruthy();
  });

  it('keeps the day editable on the coach’s page', () => {
    render(<CycleMonth month={cycle} writes={cycleWrites} />);

    expect(screen.getByRole('button', { name: /^4\. September 2026/u })).toBeTruthy();
  });
});
