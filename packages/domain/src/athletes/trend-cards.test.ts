import { describe, expect, it } from 'vitest';

import {
  MAX_CARD_ROWS,
  MAX_TREND_CARDS,
  readCardRows,
  readTrendCards,
  trendCardsPayload,
  TREND_CARDS_VERSION,
  withCardRows,
  withoutTrendCard,
  withTrendCard,
} from './trend-cards';

/**
 * Which quantities a profile follows.
 *
 * The rule under test is restraint: the list starts empty and stays empty until
 * a person chooses. A default here would be the platform deciding what matters
 * about somebody, and it would look exactly like a choice they had made.
 */

describe('reading a stored selection', () => {
  it('reads what was written', () => {
    expect(readTrendCards({ version: 1, keys: ['weight', 'grip_strength'] })).toEqual([
      'weight',
      'grip_strength',
    ]);
  });

  it('answers with nothing where nothing was chosen', () => {
    // Every athlete recorded before this existed. No cards, not "all cards".
    expect(readTrendCards(null)).toEqual([]);
    expect(readTrendCards(undefined)).toEqual([]);
  });

  it('refuses a shape it does not know rather than guessing', () => {
    expect(readTrendCards({ version: 99, keys: ['weight'] })).toEqual([]);
    expect(readTrendCards(['weight'])).toEqual([]);
    expect(readTrendCards({ version: 1, keys: ['Body Weight'] })).toEqual([]);
  });

  it('round-trips through the payload it writes', () => {
    const payload = trendCardsPayload(['weight']);

    expect(payload.version).toBe(TREND_CARDS_VERSION);
    expect(readTrendCards(payload)).toEqual(['weight']);
  });
});

describe('changing the selection', () => {
  it('appends, so an arranged order is not rearranged', () => {
    expect(withTrendCard(['weight', 'body_fat'], 'grip_strength')).toEqual([
      'weight',
      'body_fat',
      'grip_strength',
    ]);
  });

  it('adds a card only once', () => {
    const before = ['weight'];

    expect(withTrendCard(before, 'weight')).toBe(before);
  });

  it('stops at the limit rather than growing a wall', () => {
    const full = Array.from({ length: MAX_TREND_CARDS }, (_, index) => `type_${String(index)}`);

    expect(withTrendCard(full, 'one_more')).toBe(full);
  });

  it('removes without touching the rest', () => {
    expect(withoutTrendCard(['weight', 'body_fat', 'grip_strength'], 'body_fat')).toEqual([
      'weight',
      'grip_strength',
    ]);
  });

  it('shrugs at removing something that is not there', () => {
    expect(withoutTrendCard(['weight'], 'body_fat')).toEqual(['weight']);
  });
});

/**
 * The rows a table card was configured with.
 *
 * The distinction under test throughout is between **absent** and **empty**: a
 * coach who never touched the rows gets the card's default, one who removed
 * every row gets none, and a reader that collapsed the two would make the second
 * impossible to express.
 */
describe('a table card’s rows', () => {
  it('answers null where the card was never configured', () => {
    expect(readCardRows(trendCardsPayload(['biofeedback']), 'biofeedback')).toBeNull();
  });

  it('answers an empty list where every row was removed', () => {
    const payload = trendCardsPayload(['biofeedback'], { biofeedback: [] });

    expect(readCardRows(payload, 'biofeedback')).toEqual([]);
  });

  it('keeps the order the coach arranged', () => {
    const payload = trendCardsPayload(['biofeedback'], {
      biofeedback: ['stress', 'sleep_duration', 'hunger'],
    });

    expect(readCardRows(payload, 'biofeedback')).toEqual(['stress', 'sleep_duration', 'hunger']);
  });

  it('answers null for a card the payload says nothing about', () => {
    const payload = trendCardsPayload(['biofeedback', 'nutrition'], { biofeedback: ['stress'] });

    expect(readCardRows(payload, 'nutrition')).toBeNull();
  });

  it('changes one card’s rows and leaves the others alone', () => {
    const before = { biofeedback: ['stress'], nutrition: ['protein'] };

    expect(withCardRows(before, 'biofeedback', ['hunger'])).toEqual({
      biofeedback: ['hunger'],
      nutrition: ['protein'],
    });
  });

  it('caps a row list rather than storing an unbounded one', () => {
    const many = Array.from({ length: MAX_CARD_ROWS + 5 }, (_, index) => `q_${String(index)}`);

    expect(withCardRows({}, 'biofeedback', many)['biofeedback']).toHaveLength(MAX_CARD_ROWS);
  });
});

describe('a payload written before rows existed', () => {
  const first = { version: 1, keys: ['weight', 'cycle'] };

  it('is still read as the selection it is', () => {
    // A coach who arranged their profile before this existed keeps the
    // arrangement. Discarding it would clear their screen on deploy.
    expect(readTrendCards(first)).toEqual(['weight', 'cycle']);
  });

  it('carries no row selection, which is the truth about it', () => {
    expect(readCardRows(first, 'biofeedback')).toBeNull();
  });

  it('is still refused where it is not readable at all', () => {
    for (const payload of [null, undefined, 42, { version: 9, keys: [] }, { keys: ['weight'] }]) {
      expect(readTrendCards(payload)).toEqual([]);
      expect(readCardRows(payload, 'biofeedback')).toBeNull();
    }
  });
});
