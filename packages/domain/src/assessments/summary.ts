/**
 * What an assessment recorded, said plainly.
 *
 * ## This describes. It does not assess.
 *
 * Every sentence here is a statement of fact: which quantities were recorded,
 * in what units, between which values, over how many stages, and — where a
 * value was computed rather than measured — by which method. Nothing is called
 * good, bad, high, low, improved, worsened, normal or notable, and no
 * recommendation is drawn from any of it.
 *
 * That is not caution, it is the only honest option available. The catalogue
 * carries no reference ranges (`referenceMin`/`referenceMax` are null for every
 * type, deliberately — see `measurement-types/index.ts`) and the model records
 * no **direction** for any quantity: nothing anywhere says whether more lactate
 * is better or worse than less. A verdict would therefore have to be invented,
 * and an invented verdict in a health record reads exactly like a measured one.
 *
 * A difference between two examinations is arithmetic, not a verdict, so it is
 * stated — as a signed number and nothing else.
 *
 * ## Why it takes labels rather than looking them up
 *
 * Pure, and free of every catalogue: the caller passes the names it already
 * shows on screen. That is what lets the whole thing be tested without a
 * database, and what stops a second vocabulary growing here beside the one the
 * interface uses.
 */

/** One quantity of one test, as the caller already has it. */
export interface SummaryQuantity {
  /** The name the interface shows — this module never looks one up. */
  readonly name: string;
  readonly unit: string;
  /**
   * The readings that currently stand, in the order they were recorded.
   *
   * Superseded values are not passed in: a corrected reading is history, and
   * the summary describes what stands (§13).
   */
  readonly values: readonly number[];
  /**
   * How the value was computed, where it was computed rather than measured.
   *
   * Named in full, because a body-fat percentage without its method is a number
   * whose meaning cannot be checked — three-site and seven-site Jackson &
   * Pollock produce different numbers from the same body.
   */
  readonly derivation?: {
    readonly method: string;
    /**
     * What went into it — a fold sum, an age — already formatted by the caller.
     *
     * Optional: the method is what makes the number checkable and is never
     * omitted; the inputs are a convenience the caller supplies where it has
     * them to hand rather than parsing them back out of a stored sentence.
     */
    readonly inputs?: string;
  };
  /**
   * The same quantity in the previous comparable test, where there is one.
   *
   * "Comparable" is decided by the existing rule — same measurement type, same
   * athlete, same test type, not superseded, not archived — and by the caller,
   * which already applies it. Nothing is compared here that was not handed over
   * as comparable.
   */
  readonly previous?: number;
}

export interface SummaryModule {
  /** What the coach called the test, or its type where it has no name. */
  readonly name: string;
  /** The kind of test, in the interface's own words. */
  readonly typeLabel: string;
  readonly passes: number;
  readonly recorded: number;
  readonly expected: number;
  readonly quantities: readonly SummaryQuantity[];
}

export interface SummarySection {
  readonly name: string;
  readonly typeLabel: string;
  /** Plain sentences, in reading order. Never empty for a test with values. */
  readonly sentences: readonly string[];
}

/** A number the way a German-speaking coach reads one. */
function decimal(value: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value);
}

/** A signed number, because a difference without its sign says nothing. */
function signed(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return '±0';

  return `${rounded > 0 ? '+' : '−'}${decimal(Math.abs(rounded))}`;
}

/**
 * The sentence for one quantity.
 *
 * A single reading is stated as a value; several are stated as the span they
 * cover plus how many there were. The span is not a claim about the shape of
 * the curve — the diagram shows that — it is the two ends of what was recorded.
 */
function quantitySentence(quantity: SummaryQuantity): string | null {
  if (quantity.values.length === 0) return null;

  const unit = quantity.unit.trim() === '' ? '' : ` ${quantity.unit}`;
  const parts: string[] = [];

  if (quantity.values.length === 1) {
    parts.push(`${quantity.name}: ${decimal(quantity.values[0]!)}${unit}`);
  } else {
    const low = Math.min(...quantity.values);
    const high = Math.max(...quantity.values);

    parts.push(
      `${quantity.name}: ${decimal(low)} bis ${decimal(high)}${unit} ` +
        `(${String(quantity.values.length)} Werte)`,
    );
  }

  if (quantity.derivation) {
    const inputs = quantity.derivation.inputs;

    parts.push(
      `berechnet nach ${quantity.derivation.method}${inputs === undefined ? '' : ` (${inputs})`}`,
    );
  }

  // Only where both sides are a single reading. Subtracting the span of one
  // stepped test from the span of another would assert a pairing nobody
  // recorded — the same reason the value history never compared across stages.
  if (quantity.previous !== undefined && quantity.values.length === 1) {
    const difference = quantity.values[0]! - quantity.previous;

    parts.push(
      `gegenüber dem vorherigen vergleichbaren Test ${signed(difference)}${unit} ` +
        `(vorher ${decimal(quantity.previous)}${unit})`,
    );
  }

  return `${parts.join(' — ')}.`;
}

/**
 * One section per test, in the order given.
 *
 * A test whose quantities hold nothing produces a section stating exactly that,
 * rather than being dropped: an analysis that silently omitted a test would
 * leave the coach unable to tell "not included" from "nothing to say".
 */
export function summariseAssessment(modules: readonly SummaryModule[]): readonly SummarySection[] {
  return modules.map((module) => {
    const sentences: string[] = [];

    const stages = module.passes > 1 ? `, ${String(module.passes)} Stufen` : ', einfache Erfassung';

    sentences.push(
      `${String(module.recorded)} von ${String(module.expected)} Werten erfasst${stages}.`,
    );

    for (const quantity of module.quantities) {
      const sentence = quantitySentence(quantity);
      if (sentence !== null) sentences.push(sentence);
    }

    if (sentences.length === 1) sentences.push('Für diesen Test liegen keine Werte vor.');

    return { name: module.name, typeLabel: module.typeLabel, sentences };
  });
}
