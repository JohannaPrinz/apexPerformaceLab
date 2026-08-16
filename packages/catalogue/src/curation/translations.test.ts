import { describe, expect, it } from 'vitest';

import { REVIEWED } from './reviewed';
import { TRANSLATIONS } from './translations';

/**
 * The translations closed the last gap between a German catalogue and English
 * source text. These tests keep it closed.
 */

describe('the translations', () => {
  it('name each exercise once', () => {
    const names = TRANSLATIONS.map((item) => item.canonicalName);

    expect(new Set(names).size).toBe(names.length);
  });

  it('keep every entry between three and seven steps', () => {
    for (const item of TRANSLATIONS) {
      expect(item.instructions.length, item.canonicalName).toBeGreaterThanOrEqual(3);
      expect(item.instructions.length, item.canonicalName).toBeLessThanOrEqual(7);
    }
  });

  it('leave no English behind', () => {
    // Words common in the wrkout prose and not German. Deliberately not
    // "Position" or "Start" — those are German words too.
    const english = /\b(the|your|and|with|until|while|down|weight|repeat|bench)\b/i;

    for (const item of TRANSLATIONS) {
      for (const step of item.instructions) {
        expect(english.test(step), `${item.canonicalName}: ${step.slice(0, 60)}`).toBe(false);
      }
    }
  });

  /**
   * A translation must never silently override a decision. Where the review
   * wrote instructions, that text is the reviewed one and wins.
   */
  it('never collide with a reviewed instruction', () => {
    const decided = new Set(
      REVIEWED.filter((decision) => decision.instructions !== undefined).map(
        (decision) => decision.canonicalName,
      ),
    );

    for (const item of TRANSLATIONS) {
      expect(decided.has(item.canonicalName), item.canonicalName).toBe(false);
    }
  });
});
