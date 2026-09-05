import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrendCards, type TrendChartView, type TrendOptionView } from './trend-cards';

import type { CycleMonthView } from './cycle-month';

/**
 * The actions are stubbed, not exercised.
 *
 * A server action module reaches the tRPC caller and, through it, Prisma — which
 * has no database in a test environment and no business having one here. What
 * these tests are about is the screen; that the writes reach the right place is
 * asserted against the service, where a fake database can prove it.
 */
vi.mock('../server/actions', () => ({
  setTrendCardAction: vi.fn(() => Promise.resolve({})),
  setTrendCardOrderAction: vi.fn((_athleteId: string, keys: readonly string[]) => {
    mocks.ordered.push([...keys]);

    return Promise.resolve({});
  }),
  recordTrackingAction: vi.fn(() => Promise.resolve({})),
}));

/**
 * The trends of one athlete, as many as the coach wants.
 *
 * What is pinned here is the screen: that it starts empty, that a card is added
 * and removed on purpose, that the cycle card is where a bleeding is recorded —
 * and, above all, that it draws points and says nothing about them.
 *
 * The workspace boundary and the comparison rule are asserted in
 * `server/trends.test.ts` against the real queries.
 */

const mocks = vi.hoisted(() => ({
  replaced: [] as string[],
  recorded: [] as string[],
  removed: [] as string[],
  ordered: [] as string[][],
  markedDays: [] as [string, string | null][],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: (href: string) => mocks.replaced.push(href),
    refresh: vi.fn(),
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams('cases=all'),
}));

vi.mock('@/features/cycle/server/actions', () => ({
  setBleedingDayAction: (_athleteId: string, day: string, intensity: string | null) => {
    mocks.markedDays.push([day, intensity]);

    return Promise.resolve({});
  },
  removeBleedingAction: (_athleteId: string, _state: unknown, form: FormData) => {
    const value = form.get('episodeId');
    mocks.removed.push(typeof value === 'string' ? value : '');

    return Promise.resolve({ status: 'idle' });
  },
}));

const day = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

const option = (over: Partial<TrendOptionView> = {}): TrendOptionView => ({
  key: 'weight',
  kind: 'measurement',
  name: 'Weight',
  unit: 'kg',
  exercises: [],
  count: 3,
  ...over,
});

const chart = (over: Partial<TrendChartView> = {}): TrendChartView => ({
  key: 'weight',
  kind: 'measurement',
  title: 'Weight',
  unit: 'kg',
  series: [
    {
      key: 's1',
      label: 'Verlauf',
      points: [
        { at: day('2026-01-01'), value: 66 },
        { at: day('2026-03-01'), value: 64.5 },
      ],
    },
  ],
  episodes: [],
  exercises: [],
  exerciseIds: [],
  ...over,
});

const renderCards = (
  options: TrendOptionView[] = [option()],
  charts: (TrendChartView | null)[] = [],
  cards: { key: string; exerciseIds: string[] }[] = [],
  cycle: CycleMonthView | null = null,
) =>
  render(
    <TrendCards
      athleteId="ath_1"
      options={options}
      charts={charts}
      cards={cards}
      nutrition={null}
      biofeedback={null}
      cycle={cycle}
    />,
  );

beforeEach(() => {
  mocks.replaced.length = 0;
  mocks.recorded.length = 0;
  mocks.removed.length = 0;
  mocks.ordered.length = 0;
  mocks.markedDays.length = 0;
});

describe('what the area shows before anything is asked for', () => {
  it('starts with no card at all', () => {
    // Which trends matter differs per athlete and per question.
    renderCards();

    expect(screen.getByText(/Noch keine Karte/)).toBeVisible();
    expect(document.querySelectorAll('polyline')).toHaveLength(0);
  });

  it('offers to add one', () => {
    renderCards();

    expect(screen.getByRole('button', { name: /Karte hinzufügen/ })).toBeVisible();
  });

  it('says so where there is nothing to draw at all', () => {
    renderCards([]);

    expect(screen.getByText(/lässt sich noch nichts über die Zeit darstellen/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Karte hinzufügen/ })).toBeNull();
  });
});

describe('adding a card', () => {
  it('offers what this athlete has', async () => {
    const user = userEvent.setup();
    renderCards([option(), option({ key: 'body_fat', name: 'Body Fat', unit: '%' })]);

    await user.click(screen.getByRole('button', { name: /Karte hinzufügen/ }));

    expect(screen.getByRole('button', { name: /Weight/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Body Fat/ })).toBeVisible();
  });

  it('offers a card that has nothing recorded yet, and says so', async () => {
    // A body-weight card that only appeared once a weight existed would be a
    // card nobody could use to start tracking one.
    const user = userEvent.setup();
    renderCards([option({ count: 0 })]);

    await user.click(screen.getByRole('button', { name: /Karte hinzufügen/ }));

    expect(screen.getByRole('button', { name: /noch nichts erfasst/ })).toBeVisible();
  });

  it('writes it into the address bar', async () => {
    const user = userEvent.setup();
    renderCards();

    await user.click(screen.getByRole('button', { name: /Karte hinzufügen/ }));
    await user.click(screen.getByRole('button', { name: /Weight/ }));

    expect(mocks.replaced[0]).toContain('card=weight');
  });

  it('keeps what else was in the address bar', async () => {
    const user = userEvent.setup();
    renderCards();

    await user.click(screen.getByRole('button', { name: /Karte hinzufügen/ }));
    await user.click(screen.getByRole('button', { name: /Weight/ }));

    expect(mocks.replaced[0]).toContain('cases=all');
  });

  it('does not offer a card that is already on screen', async () => {
    // The same card twice would be one card twice.
    const user = userEvent.setup();
    renderCards(
      [option(), option({ key: 'body_fat', name: 'Body Fat', unit: '%' })],
      [chart()],
      [{ key: 'weight', exerciseIds: [] }],
    );

    await user.click(screen.getByRole('button', { name: /Karte hinzufügen/ }));

    expect(screen.getByRole('button', { name: /Body Fat/ })).toBeVisible();
    // Only the card's own heading and its remove button carry the name.
    expect(screen.queryByRole('button', { name: /^Weight kg$/ })).toBeNull();
  });

  it('offers nothing more once every card is on screen', () => {
    renderCards([option()], [chart()], [{ key: 'weight', exerciseIds: [] }]);

    expect(screen.queryByRole('button', { name: /Karte hinzufügen/ })).toBeNull();
  });

  it('is not limited to two', async () => {
    const user = userEvent.setup();
    const options = ['a', 'b', 'c', 'd'].map((key) => option({ key, name: key.toUpperCase() }));
    renderCards(
      options,
      [chart(), chart(), chart()],
      [
        { key: 'a', exerciseIds: [] },
        { key: 'b', exerciseIds: [] },
        { key: 'c', exerciseIds: [] },
      ],
    );

    await user.click(screen.getByRole('button', { name: /Karte hinzufügen/ }));
    await user.click(screen.getByRole('button', { name: /^D/ }));

    expect(mocks.replaced[0]?.match(/card=/g)).toHaveLength(4);
  });
});

describe('removing a card', () => {
  it('offers it on every card', () => {
    renderCards([option()], [chart()], [{ key: 'weight', exerciseIds: [] }]);

    expect(screen.getByRole('button', { name: 'Weight entfernen' })).toBeVisible();
  });

  it('takes only that one out', async () => {
    const user = userEvent.setup();
    renderCards(
      [option(), option({ key: 'body_fat', name: 'Body Fat' })],
      [chart(), chart({ key: 'body_fat', title: 'Body Fat' })],
      [
        { key: 'weight', exerciseIds: [] },
        { key: 'body_fat', exerciseIds: [] },
      ],
    );

    await user.click(screen.getByRole('button', { name: 'Weight entfernen' }));

    expect(mocks.replaced[0]).toContain('card=body_fat');
    expect(mocks.replaced[0]).not.toContain('card=weight');
  });
});

describe('narrowing a card to movements', () => {
  const lifts = () =>
    chart({
      key: 'external_load',
      title: 'External Load',
      exercises: [
        { id: 'ex_bench', name: 'Bankdrücken' },
        { id: 'ex_dead', name: 'Kreuzheben' },
      ],
    });

  it('offers them only where the quantity was recorded per movement', () => {
    renderCards([option()], [chart()], [{ key: 'weight', exerciseIds: [] }]);

    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('offers several at once', () => {
    renderCards([option()], [lifts()], [{ key: 'external_load', exerciseIds: [] }]);

    expect(screen.getByRole('checkbox', { name: 'Bankdrücken' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Kreuzheben' })).toBeVisible();
  });

  it('says that no choice means all of them', () => {
    renderCards([option()], [lifts()], [{ key: 'external_load', exerciseIds: [] }]);

    expect(screen.getByText(/ohne Auswahl werden alle dargestellt/)).toBeVisible();
  });

  it('writes the movement into the card, not into a new one', async () => {
    const user = userEvent.setup();
    renderCards([option()], [lifts()], [{ key: 'external_load', exerciseIds: [] }]);

    await user.click(screen.getByRole('checkbox', { name: 'Kreuzheben' }));

    expect(mocks.replaced[0]).toContain('card=external_load%3Aex_dead');
    expect(mocks.replaced[0]?.match(/card=/g)).toHaveLength(1);
  });

  it('takes one away again', async () => {
    const user = userEvent.setup();
    renderCards(
      [option()],
      [{ ...lifts(), exerciseIds: ['ex_bench', 'ex_dead'] }],
      [{ key: 'external_load', exerciseIds: ['ex_bench', 'ex_dead'] }],
    );

    await user.click(screen.getByRole('checkbox', { name: 'Bankdrücken' }));

    expect(mocks.replaced[0]).toContain('ex_dead');
    expect(mocks.replaced[0]).not.toContain('ex_bench');
  });
});

describe('what a card draws', () => {
  const drawn = () => renderCards([option()], [chart()], [{ key: 'weight', exerciseIds: [] }]);

  it('draws one line per series', () => {
    drawn();

    expect(document.querySelectorAll('polyline')).toHaveLength(1);
  });

  it('stays reachable as data', () => {
    drawn();

    expect(screen.getByRole('img')).toHaveAccessibleName(/Weight in kg/);
    expect(screen.getByRole('img')).toHaveAccessibleName(/2 Werte/);
  });

  it('names the span of dates and values', () => {
    drawn();

    expect(screen.getByText('01.01.26')).toBeVisible();
    expect(screen.getByText(/64,5 – 66 kg/)).toBeVisible();
  });

  it('says so where the card holds nothing yet', () => {
    renderCards(
      [option({ count: 0 })],
      [chart({ series: [] })],
      [{ key: 'weight', exerciseIds: [] }],
    );

    // The wording now points somewhere: an empty card is the one place a coach
    // is invited to write the first value down.
    expect(screen.getByText(/Noch nichts erfasst/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Startwert eintragen' })).toBeVisible();
  });

  it('asks for a value, not only for a starting one, once a curve exists', () => {
    renderCards([option()], [chart()], [{ key: 'weight', exerciseIds: [] }]);

    expect(screen.getByRole('button', { name: 'Wert eintragen' })).toBeVisible();
  });

  it('offers no entry where the card is narrowed to particular movements', () => {
    // A value written here belongs to no lift, and filing it under one would be
    // a claim nobody made.
    renderCards(
      [option()],
      [chart({ exercises: [{ id: 'ex_1', name: 'Kniebeuge' }], exerciseIds: ['ex_1'] })],
      [{ key: 'weight', exerciseIds: ['ex_1'] }],
    );

    expect(screen.queryByRole('button', { name: /Wert eintragen|Startwert eintragen/ })).toBeNull();
  });

  it('gives each line a shape of its own, not colour alone', () => {
    renderCards(
      [option()],
      [
        chart({
          series: [
            { key: 'a', label: 'Bankdrücken', points: [{ at: day('2026-01-01'), value: 80 }] },
            { key: 'b', label: 'Kreuzheben', points: [{ at: day('2026-01-01'), value: 140 }] },
          ],
        }),
      ],
      [{ key: 'external_load', exerciseIds: [] }],
    );

    // Scoped to the chart's own legend: every card now carries a drag handle,
    // which is also an `aria-hidden` span inside a list item.
    const swatches = [...document.querySelectorAll('figure li span[aria-hidden]')].map((node) =>
      node.className.replace(/bg-chart-\d/g, ''),
    );

    expect(swatches).toHaveLength(2);
    expect(swatches[0]).not.toBe(swatches[1]);
  });

  it('never calls a change good or bad', () => {
    drawn();

    const text = (document.body.textContent ?? '').toLowerCase();

    for (const word of ['verbessert', 'verschlechtert', 'trend', 'norm', 'ziel', 'auffällig']) {
      expect(text, word).not.toContain(word);
    }
  });
});

/**
 * The cycle card is a month, and marking a day is how a bleeding is recorded.
 *
 * The rule under test throughout is the one the design system states and this
 * card is the hardest case for: **colour never carries meaning alone**. Four
 * strengths drawn as one red at four opacities collapse into one mark in
 * greyscale, so each step has to differ in shape as well, and the legend has to
 * name every one of them in words.
 */
describe('the cycle card', () => {
  const march = (days: CycleMonthView['days']) =>
    renderCards(
      [option({ key: 'cycle', kind: 'cycle', name: 'Zyklus', unit: '' })],
      [chart({ key: 'cycle', kind: 'cycle', title: 'Zyklus', unit: '', series: [], episodes: [] })],
      [{ key: 'cycle', exerciseIds: [] }],
      { month: day('2026-03-01'), days },
    );

  const blank = (iso: string): CycleMonthView['days'][number] => ({
    date: day(iso),
    marked: false,
    intensity: null,
    episodeId: null,
    partOfRange: false,
    note: null,
    recordedBy: null,
  });

  const wholeMarch = () =>
    Array.from({ length: 31 }, (_, index) =>
      blank(`2026-03-${String(index + 1).padStart(2, '0')}`),
    );

  it('lays out every day of the month', () => {
    march(wholeMarch());

    // A grid needs every cell, not only the ones with something in them.
    // Exact names, because `/4. März/` also matches the 14th and the 24th.
    const named = screen
      .getAllByRole('button')
      .map((node) => node.getAttribute('aria-label') ?? '')
      .filter((label) => label.includes('März 2026'));

    expect(named).toHaveLength(31);
    expect(named[0]).toBe('1. März 2026 — nichts dokumentiert');
    expect(named[30]).toBe('31. März 2026 — nichts dokumentiert');
  });

  it('says in words what each day holds, not only in colour', () => {
    const days = wholeMarch();
    days[3] = { ...blank('2026-03-04'), marked: true, intensity: 'HEAVY', episodeId: 'ep_1' };
    march(days);

    // A screen reader cannot see how full a circle is.
    expect(screen.getByRole('button', { name: '4. März 2026 — Stark' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: '5. März 2026 — nichts dokumentiert' }),
    ).toBeVisible();
  });

  it('names all four strengths in a legend', () => {
    march(wholeMarch());

    for (const label of ['Schmierblutung', 'Leicht', 'Mittel', 'Stark']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('offers the four strengths when a day is opened', async () => {
    const user = userEvent.setup();
    march(wholeMarch());

    await user.click(screen.getByRole('button', { name: '4. März 2026 — nichts dokumentiert' }));

    expect(screen.getByRole('group', { name: 'Stärke für 4. März 2026' })).toBeVisible();
  });

  it('records the strength that was chosen', async () => {
    const user = userEvent.setup();
    march(wholeMarch());

    await user.click(screen.getByRole('button', { name: '4. März 2026 — nichts dokumentiert' }));
    const picker = screen.getByRole('group', { name: 'Stärke für 4. März 2026' });
    await user.click(within(picker).getByRole('button', { name: 'Mittel' }));

    expect(mocks.markedDays).toEqual([['2026-03-04', 'MEDIUM']]);
  });

  it('clears a day with the same control that marked it', async () => {
    const user = userEvent.setup();
    const days = wholeMarch();
    days[3] = { ...blank('2026-03-04'), marked: true, intensity: 'LIGHT', episodeId: 'ep_1' };
    march(days);

    await user.click(screen.getByRole('button', { name: '4. März 2026 — Leicht' }));
    const picker = screen.getByRole('group', { name: 'Stärke für 4. März 2026' });
    await user.click(within(picker).getByRole('button', { name: 'Nichts' }));

    expect(mocks.markedDays).toEqual([['2026-03-04', null]]);
  });

  it('refuses to split an entry that covers several days', async () => {
    // Splitting one would mean inventing a strength for the days nobody
    // touched. It offers the operation that does exist instead.
    const user = userEvent.setup();
    const days = wholeMarch();
    days[3] = {
      ...blank('2026-03-04'),
      marked: true,
      intensity: null,
      episodeId: 'ep_range',
      partOfRange: true,
    };
    march(days);

    await user.click(
      screen.getByRole('button', { name: '4. März 2026 — dokumentiert, ohne Stärke' }),
    );

    expect(screen.queryByRole('group', { name: /Stärke für/ })).toBeNull();
    expect(screen.getByText(/mehrtägigen Eintrag/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Ganzen Eintrag entfernen' }));
    expect(mocks.removed).toEqual(['ep_range']);
  });

  it('says who documented a day', () => {
    const days = wholeMarch();
    days[3] = {
      ...blank('2026-03-04'),
      marked: true,
      intensity: 'MEDIUM',
      episodeId: 'ep_1',
      recordedBy: 'ATHLETE',
    };
    march(days);

    // The strength reaches a screen reader through the day's own name; who
    // documented it is stated in the panel the day opens.
    expect(screen.getByRole('button', { name: '4. März 2026 — Mittel' })).toBeVisible();
  });

  it('computes no phase, length or prediction', () => {
    const days = wholeMarch();
    days[3] = { ...blank('2026-03-04'), marked: true, intensity: 'HEAVY', episodeId: 'ep_1' };
    march(days);

    // Scoped to what the card *states about the athlete* — the name of every
    // day. A body-wide scan would fail on the very sentence that promises
    // nothing is computed ("weder eine Zyklusphase noch …").
    const stated = screen
      .getAllByRole('button')
      .map((node) => node.getAttribute('aria-label') ?? '')
      .filter((label) => label.includes('März 2026'))
      .join(' ')
      .toLowerCase();

    expect(stated).toContain('stark');
    for (const word of ['phase', 'zykluslänge', 'eisprung', 'voraussichtlich', 'fruchtbar']) {
      expect(stated, word).not.toContain(word);
    }
  });

  it('says outright that nothing is derived from the entries', () => {
    march(wholeMarch());

    expect(screen.getByText(/nichts daraus abgeleitet/)).toBeVisible();
  });
});
