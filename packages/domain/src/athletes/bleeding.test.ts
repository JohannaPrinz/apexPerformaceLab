import { describe, expect, it } from 'vitest';

import {
  BLEEDING_INTENSITIES,
  BLEEDING_INTENSITY_FILL,
  BLEEDING_INTENSITY_LABELS_DE,
  readBleedingIntensity,
} from './bleeding';

/**
 * The strength of a documented bleeding.
 *
 * Small, and worth pinning anyway: the order is what a legend is drawn in, the
 * fill is what keeps the four apart without colour, and the cycle is the whole
 * interaction of the calendar.
 */

describe('the four steps', () => {
  it('run weakest to strongest', () => {
    expect([...BLEEDING_INTENSITIES]).toEqual(['SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY']);
  });

  it('are named the way a coach says them', () => {
    expect(BLEEDING_INTENSITY_LABELS_DE.SPOTTING).toBe('Schmierblutung');
    expect(BLEEDING_INTENSITY_LABELS_DE.HEAVY).toBe('Stark');
  });

  it('differ in fill, not only in hue', () => {
    // The design system is explicit that colour never carries meaning alone. If
    // two steps ever share a fill they become one mark in greyscale.
    const fills = BLEEDING_INTENSITIES.map((key) => BLEEDING_INTENSITY_FILL[key]);

    expect(new Set(fills).size).toBe(fills.length);
    expect(fills).toEqual([...fills].sort((left, right) => left - right));
    // Spotting is an outline, which is a different shape rather than a paler
    // version of the same one.
    expect(BLEEDING_INTENSITY_FILL.SPOTTING).toBe(0);
  });
});

describe('reading a stored strength', () => {
  it('accepts the four', () => {
    for (const key of BLEEDING_INTENSITIES) expect(readBleedingIntensity(key)).toBe(key);
  });

  it('answers null for anything else, never a guess', () => {
    // An entry made before this existed has no answer, and so does one that
    // only names the days. Both are an absence, not a fifth step.
    for (const value of [null, undefined, '', 'stark', 'SEHR_STARK', 3, {}]) {
      expect(readBleedingIntensity(value)).toBeNull();
    }
  });
});
