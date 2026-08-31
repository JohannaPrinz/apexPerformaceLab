import { describe, expect, it } from 'vitest';

import { tendencyOf, tendencyWord, TENDENCY_LABELS_DE } from './tendency';

/**
 * Whether a change may be called an improvement.
 *
 * The rule under test is a refusal: without a declared direction there is no
 * such thing as a better number, and this must answer `null` rather than pick
 * a plausible-looking side. Colour is the loudest claim the interface makes,
 * and it is made from exactly this function.
 */

describe('with a declared direction', () => {
  it('calls a fall toward the aim where lower is wanted', () => {
    expect(tendencyOf(-5, 'lower')).toBe('toward');
  });

  it('calls a rise away from the aim where lower is wanted', () => {
    expect(tendencyOf(2, 'lower')).toBe('away');
  });

  it('reverses both where higher is wanted', () => {
    expect(tendencyOf(2, 'higher')).toBe('toward');
    expect(tendencyOf(-5, 'higher')).toBe('away');
  });

  it('treats no movement as its own answer, not as an improvement', () => {
    expect(tendencyOf(0, 'lower')).toBe('unchanged');
    expect(tendencyOf(0, 'higher')).toBe('unchanged');
  });
});

describe('without a declared direction', () => {
  it('says nothing, however large the change', () => {
    // A body weight that fell by two kilograms is neither good nor bad until
    // somebody says what the test was for.
    expect(tendencyOf(-2, null)).toBeNull();
    expect(tendencyOf(2, null)).toBeNull();
    expect(tendencyOf(0, null)).toBeNull();
  });

  it('says nothing where there is no earlier reading to compare against', () => {
    expect(tendencyOf(null, 'lower')).toBeNull();
    expect(tendencyOf(null, null)).toBeNull();
  });
});

describe('the words beside the number', () => {
  it('uses the exact word where the quantity has one', () => {
    expect(tendencyWord('toward', 'duration')).toBe('schneller');
    expect(tendencyWord('away', 'duration')).toBe('langsamer');
  });

  it('falls back to wording about the aim, never about the person', () => {
    expect(tendencyWord('toward', 'weight')).toBe(TENDENCY_LABELS_DE.toward);
    expect(tendencyWord('away', 'weight')).toBe(TENDENCY_LABELS_DE.away);
  });

  it('names an unchanged value rather than leaving it blank', () => {
    expect(tendencyWord('unchanged', 'duration')).toBe('unverändert');
  });

  it('offers no word at all where no tendency may be stated', () => {
    expect(tendencyWord(null, 'duration')).toBeNull();
  });

  it('never answers with an empty string, which a falsy check would swallow', () => {
    for (const tendency of ['toward', 'away', 'unchanged'] as const) {
      expect(tendencyWord(tendency, 'anything')).not.toBe('');
    }
  });
});
