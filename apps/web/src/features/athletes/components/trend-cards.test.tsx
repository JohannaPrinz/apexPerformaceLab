import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrendCards, type TrendChartView, type TrendOptionView } from './trend-cards';

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
  recordBleedingAction: (_state: unknown, form: FormData) => {
    const value = form.get('startedOn');
    mocks.recorded.push(typeof value === 'string' ? value : '');

    return Promise.resolve({ status: 'idle' });
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
) => render(<TrendCards athleteId="ath_1" options={options} charts={charts} cards={cards} />);

beforeEach(() => {
  mocks.replaced.length = 0;
  mocks.recorded.length = 0;
  mocks.removed.length = 0;
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

    expect(screen.getByText('Noch nichts erfasst.')).toBeVisible();
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

    const swatches = [...document.querySelectorAll('li span[aria-hidden]')].map((node) =>
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
 * The cycle card is where a bleeding is recorded, not only where it is read.
 * A log and the entry that feeds it are one thing.
 */
describe('the cycle card', () => {
  const cycle = (episodes: TrendChartView['episodes'] = []) =>
    renderCards(
      [option({ key: 'cycle', kind: 'cycle', name: 'Zyklus', unit: '' })],
      [chart({ key: 'cycle', kind: 'cycle', title: 'Zyklus', unit: '', series: [], episodes })],
      [{ key: 'cycle', exerciseIds: [] }],
    );

  const episode = {
    id: 'ep_1',
    startedOn: day('2026-02-02'),
    endedOn: day('2026-02-06'),
    note: null,
    recordedBy: 'COACH' as const,
  };

  it('asks for the first day and nothing more', () => {
    cycle();

    expect(screen.getByLabelText(/Erster Tag/)).toBeRequired();
    expect(screen.getByLabelText(/Letzter Tag/)).not.toBeRequired();
  });

  it('records what was entered', async () => {
    const user = userEvent.setup();
    cycle();

    await user.type(screen.getByLabelText(/Erster Tag/), '2026-03-04');
    await user.click(screen.getByRole('button', { name: 'Blutung dokumentieren' }));

    expect(mocks.recorded).toEqual(['2026-03-04']);
  });

  it('says plainly when nothing has been documented', () => {
    cycle();

    expect(screen.getByText('Noch nichts dokumentiert.')).toBeVisible();
  });

  it('lists what was written down', () => {
    cycle([episode]);

    expect(screen.getByText('02.02.2026')).toBeVisible();
    expect(screen.getByText(/bis 06\.02\.2026/)).toBeVisible();
  });

  it('says when no end was documented rather than inventing one', () => {
    cycle([{ ...episode, endedOn: null }]);

    expect(screen.getByText('Ende nicht dokumentiert')).toBeVisible();
  });

  it('says who recorded it', () => {
    cycle([{ ...episode, recordedBy: 'ATHLETE' }]);

    expect(screen.getByText('Vom Athleten')).toBeVisible();
  });

  it('lets an entry be removed', async () => {
    const user = userEvent.setup();
    cycle([episode]);

    await user.click(screen.getByRole('button', { name: 'Entfernen' }));

    expect(mocks.removed).toEqual(['ep_1']);
  });

  it('computes no phase, length or prediction', () => {
    cycle([episode, { ...episode, id: 'ep_2', startedOn: day('2026-03-04'), endedOn: null }]);

    const lists = screen.getAllByRole('list');
    const text = within(lists[lists.length - 1]!)
      .queryAllByRole('listitem')
      .map((node) => node.textContent ?? '')
      .join(' ')
      .toLowerCase();

    for (const word of ['phase', 'zykluslänge', 'eisprung', 'voraussichtlich', 'fruchtbar']) {
      expect(text, word).not.toContain(word);
    }
  });

  it('says outright that nothing is derived from the entries', () => {
    cycle();

    expect(screen.getByText(/nichts daraus abgeleitet/)).toBeVisible();
  });
});
