import type { BetterDirection } from '../modules/self-comparison';

/**
 * Whether a change moved toward what the test declared as its aim.
 *
 * ## Why this is a separate rule and not an `if` in a component
 *
 * Colour is the strongest claim an interface can make about a number, and it is
 * made in three places — the overview diagram, the tile, the shared document.
 * One rule, one file, one test: a green bar and a red bar must never disagree
 * about the same measurement because two components each decided for themselves.
 *
 * ## The condition for saying anything at all
 *
 * A direction has to be **declared**. `betterDirection` lives in the test's
 * protocol and is set by the coach; nothing in the record infers it, and nothing
 * here guesses. Without it there is no such thing as an improvement — a body
 * weight that fell by two kilograms is neither good nor bad until somebody says
 * what the test was for.
 *
 * So `null` is the normal answer, not an error, and an interface that receives
 * it shows the signed difference in grey and stops there.
 */

/** What a change did, relative to the declared aim. */
export type Tendency =
  /** Moved the way the test wants. */
  | 'toward'
  /** Moved the other way. */
  | 'away'
  /** Did not move at all. */
  | 'unchanged';

/**
 * The tendency of one change, or `null` where none can be stated.
 *
 * `null` for two different reasons, and both are legitimate: no earlier reading
 * to compare against, or no direction declared for this test. Neither is a
 * failure, and neither may be rendered as a verdict.
 */
export function tendencyOf(
  difference: number | null,
  direction: BetterDirection | null,
): Tendency | null {
  if (difference === null || direction === null) return null;
  if (difference === 0) return 'unchanged';

  const fell = difference < 0;

  return (direction === 'lower') === fell ? 'toward' : 'away';
}

/**
 * How a tendency is said in words.
 *
 * Words as well as colour, always. The design system's rule for series colour is
 * that it is never the only signal, and the same applies here — more so, because
 * this colour carries a judgement rather than an identity.
 *
 * The wording is deliberately about the **aim**, not about the athlete. "Toward
 * the aim" is a statement about a number; "better" is a statement about a person,
 * and the record does not support it.
 */
export const TENDENCY_LABELS_DE: Readonly<Record<Tendency, string>> = {
  toward: 'in Zielrichtung',
  away: 'entgegen der Zielrichtung',
  unchanged: 'unverändert',
};

/**
 * The natural word for a change, where a measurement type has one.
 *
 * A duration that fell is *faster*, and writing "in Zielrichtung" beside a
 * running time when German has the exact word would be worse language, not
 * more careful language. The map is small, closed, and keyed by catalogue key —
 * a type that is not in it falls back to the neutral wording above, which is
 * why adding one is never urgent.
 */
const DIRECTIONAL_WORDS_DE: Readonly<
  Record<string, { readonly toward: string; readonly away: string }>
> = {
  duration: { toward: 'schneller', away: 'langsamer' },
  pace: { toward: 'schneller', away: 'langsamer' },
};

/**
 * What to write beside the number.
 *
 * `null` where nothing may be said — the caller then shows the bare signed
 * difference. Never returns an empty string, so a falsy check cannot silently
 * turn "unchanged" into "say nothing".
 */
export function tendencyWord(tendency: Tendency | null, measurementTypeKey: string): string | null {
  if (tendency === null) return null;
  if (tendency === 'unchanged') return TENDENCY_LABELS_DE.unchanged;

  return DIRECTIONAL_WORDS_DE[measurementTypeKey]?.[tendency] ?? TENDENCY_LABELS_DE[tendency];
}
