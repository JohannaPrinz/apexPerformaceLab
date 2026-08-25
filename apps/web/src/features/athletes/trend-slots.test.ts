import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  encodeTrendCards,
  MAX_TREND_CARDS,
  parseTrendCards,
  TREND_CARD_PARAM,
} from './trend-slots';

/**
 * How the cards on screen travel in the address bar — and where that code is
 * allowed to live.
 *
 * A browser run found the defect the last rule guards: the encoding sat in the
 * `'use client'` component that uses it, and a Server Component importing it
 * got a client *reference* rather than the value. Typecheck, lint and the whole
 * suite stayed green, because the type was right and only the runtime value was
 * not.
 */

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('reading the cards out of an address', () => {
  it('reads a single card', () => {
    expect(parseTrendCards('weight')).toEqual([{ key: 'weight', exerciseIds: [] }]);
  });

  it('reads several, in the order they were written', () => {
    expect(parseTrendCards(['weight', 'cycle'])).toEqual([
      { key: 'weight', exerciseIds: [] },
      { key: 'cycle', exerciseIds: [] },
    ]);
  });

  it('reads the movements a card was narrowed to', () => {
    expect(parseTrendCards('external_load:ex_1,ex_2')).toEqual([
      { key: 'external_load', exerciseIds: ['ex_1', 'ex_2'] },
    ]);
  });

  it('reads nothing where nothing was asked for', () => {
    // The page opens with no cards.
    expect(parseTrendCards(undefined)).toEqual([]);
  });

  it('drops an entry that is not a card', () => {
    expect(parseTrendCards(['', ':ex_1', 'weight'])).toEqual([{ key: 'weight', exerciseIds: [] }]);
  });

  it('refuses an address asking for more than a screen holds', () => {
    const many = Array.from(
      { length: MAX_TREND_CARDS + 5 },
      (_entry, index) => `k${String(index)}`,
    );

    expect(parseTrendCards(many)).toHaveLength(MAX_TREND_CARDS);
  });

  it('survives a round trip', () => {
    const cards = [
      { key: 'weight', exerciseIds: [] },
      { key: 'external_load', exerciseIds: ['ex_1', 'ex_2'] },
      { key: 'cycle', exerciseIds: [] },
    ];

    expect(parseTrendCards(encodeTrendCards(cards))).toEqual(cards);
  });
});

describe('where the encoding lives', () => {
  it('is a real function, not a client reference', () => {
    // The shape a Server Component depends on.
    expect(typeof parseTrendCards).toBe('function');
    expect(typeof TREND_CARD_PARAM).toBe('string');
  });

  it('lives outside every client module', () => {
    // Checked as the *directive* — the first statement of the file — because
    // the prose above explains why it must not be there.
    const first = read('./trend-slots.ts')
      .split(String.fromCharCode(10))
      .map((line) => line.trim())
      .find((line) => line !== '' && !line.startsWith('*') && !line.startsWith('/*'));

    expect(first).not.toMatch(/^['"]use client['"]/);
  });

  it('is not re-exported from the client component either', () => {
    // Re-exporting would put the proxy back in the way.
    const component = read('./components/trend-cards.tsx');

    expect(component).not.toMatch(/export (const|function) (parseTrendCards|encodeTrendCards)/);
  });

  it('is what the athlete page reads its cards from', () => {
    const page = read('../../app/(app)/athletes/[athleteId]/page.tsx');

    expect(page).toContain("from '@/features/athletes/trend-slots'");
    expect(page).toContain('parseTrendCards');
  });
});
