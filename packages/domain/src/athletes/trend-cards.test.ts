import { describe, expect, it } from 'vitest';

import {
  MAX_TREND_CARDS,
  readTrendCards,
  trendCardsPayload,
  TREND_CARDS_VERSION,
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
