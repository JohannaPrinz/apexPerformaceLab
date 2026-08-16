import { describe, expect, it } from 'vitest';

import { EXERCISE_RELATIONSHIP_TYPES } from '@apex/domain';

import { REVIEWED } from './reviewed';
import { isDecided, NOT_RELATED, RELATIONSHIPS, type Relationship } from './variants';

/**
 * The hand-set variants replaced 403 generated ones. These tests guard the two
 * properties that made the generated set unusable, so it cannot come back by
 * accident.
 */

describe('every pair was judged, not derived', () => {
  it('carries a reason', () => {
    for (const pair of [...RELATIONSHIPS, ...NOT_RELATED]) {
      expect(pair.basis.length, `${pair.a} ↔ ${pair.b}`).toBeGreaterThan(20);
    }
  });

  it('never pairs an exercise with itself', () => {
    for (const pair of [...RELATIONSHIPS, ...NOT_RELATED]) {
      expect(pair.a).not.toBe(pair.b);
    }
  });

  it('lists no pair twice, in either direction', () => {
    const keys = [...RELATIONSHIPS, ...NOT_RELATED].map((pair: Relationship) =>
      [pair.a, pair.b].sort().join(' ↔ '),
    );

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never both links and separates the same pair', () => {
    const linked = new Set(RELATIONSHIPS.map((pair) => [pair.a, pair.b].sort().join(' ↔ ')));

    for (const pair of NOT_RELATED) {
      expect(linked.has([pair.a, pair.b].sort().join(' ↔ ')), `${pair.a} ↔ ${pair.b}`).toBe(false);
    }
  });
});

/**
 * The failure that made the generated set worthless: a family word joined every
 * member to every other, so 19 squats became 171 pairs. Transitivity is not
 * assumed here — three exercises that belong together are listed as three pairs
 * a person approved, and nothing beyond them is inferred.
 */
describe('no clique expansion', () => {
  it('leaves a pair unlinked unless somebody approved it', () => {
    // Power Clean ↔ Hang Power Clean and Hang Clean ↔ Hang Power Clean are both
    // approved. Power Clean ↔ Hang Clean is not, and must not appear.
    expect(isDecided('Power Clean', 'Hang Power Clean')).toBe(true);
    expect(isDecided('Hang Clean', 'Hang Power Clean')).toBe(true);
    expect(isDecided('Power Clean', 'Hang Clean')).toBe(false);
  });

  it('keeps the largest group small enough to have been read', () => {
    const degree = new Map<string, number>();

    for (const pair of RELATIONSHIPS) {
      for (const name of [pair.a, pair.b]) degree.set(name, (degree.get(name) ?? 0) + 1);
    }

    // The generated set gave single exercises 18 links. Nothing here should come
    // close; if it does, the set has started growing by inference again.
    for (const [name, count] of degree) {
      expect(count, name).toBeLessThanOrEqual(4);
    }
  });
});

describe('recognising a decided pair', () => {
  it('matches in either direction', () => {
    expect(isDecided('Cable Crunch', 'Cable Reverse Crunch')).toBe(true);
    expect(isDecided('Cable Reverse Crunch', 'Cable Crunch')).toBe(true);
  });

  it('does not claim an undecided pair', () => {
    expect(isDecided('Barbell Squat', 'Bench Dip')).toBe(false);
  });
});

describe('the pairs name exercises the catalogue still has', () => {
  it('names nothing the review struck out', () => {
    const removed = new Set(
      REVIEWED.filter((decision) => decision.remove !== undefined).map(
        (decision) => decision.canonicalName,
      ),
    );

    for (const pair of [...RELATIONSHIPS, ...NOT_RELATED]) {
      expect(removed.has(pair.a), pair.a).toBe(false);
      expect(removed.has(pair.b), pair.b).toBe(false);
    }
  });
});

describe('the relationship type', () => {
  it('uses only the two agreed values', () => {
    for (const pair of [...RELATIONSHIPS, ...NOT_RELATED]) {
      expect(EXERCISE_RELATIONSHIP_TYPES as readonly string[], `${pair.a} ↔ ${pair.b}`).toContain(
        pair.type,
      );
    }
  });

  it('distinguishes replacing from resembling', () => {
    const find = (a: string, b: string) =>
      RELATIONSHIPS.find((pair) => [pair.a, pair.b].sort().join() === [a, b].sort().join())?.type;

    // A dumbbell squat can stand in for a barbell squat.
    expect(find('Barbell Squat', 'Dumbbell Squat')).toBe('alternative');
    // A front squat cannot — it trains something the back squat does not.
    expect(find('Barbell Squat', 'Front Barbell Squat')).toBe('related');
  });
});
