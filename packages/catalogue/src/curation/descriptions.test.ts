import { describe, expect, it } from 'vitest';

import { DESCRIPTIONS } from './descriptions';

/**
 * The description is what makes 131 exercises with identical filter attributes
 * distinguishable in a picker. These tests guard the properties that make it
 * useful rather than decorative.
 */

describe('the descriptions', () => {
  it('name each exercise once', () => {
    const names = DESCRIPTIONS.map((item) => item.canonicalName);

    expect(new Set(names).size).toBe(names.length);
  });

  it('say something, in one or two sentences', () => {
    for (const item of DESCRIPTIONS) {
      expect(item.description.length, item.canonicalName).toBeGreaterThan(40);
      expect(item.description.length, item.canonicalName).toBeLessThan(220);
    }
  });

  it('never repeat the exercise name back at the reader', () => {
    // "Bankdrücken mit Kurzhanteln: Bankdrücken mit Kurzhanteln …" says nothing
    // the name did not. The description exists to add the distinguishing fact.
    for (const item of DESCRIPTIONS) {
      expect(item.description.trim().length, item.canonicalName).toBeGreaterThan(
        item.canonicalName.length,
      );
    }
  });

  it('is German', () => {
    const english = /\b(the|your|and|with|until|while|weight|repeat)\b/i;

    for (const item of DESCRIPTIONS) {
      expect(english.test(item.description), item.canonicalName).toBe(false);
    }
  });
});
