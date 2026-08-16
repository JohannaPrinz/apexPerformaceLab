/**
 * The neutral analysis format.
 *
 * Every external dataset is read into this shape **before** anything is
 * compared. It is deliberately *not* our `Exercise`: nothing here is validated
 * against our taxonomy, nothing is renamed, nothing is dropped. A source's own
 * words survive intact, because the whole point of the exercise is to see what
 * the sources actually say — including where they disagree with us.
 *
 * ## Why this is not the production model
 *
 * `Exercise` is the catalogue we stand behind: controlled vocabularies, German
 * names we chose, a licence we cleared. This is research material. Merging the
 * two would mean the moment a dataset is downloaded, its opinions are ours —
 * and the reason to look at four sources is precisely that they disagree.
 *
 * That separation is structural, not a convention: this package lives outside
 * the product, nothing in `apps/web` may import it, and no code path leads from
 * here into the database.
 *
 * ## What is kept
 *
 * Everything needed to trace a claim back to who made it: the source, that
 * source's own identifier, the licence it arrived under, and the raw values as
 * strings. `raw` holds whatever did not fit the common shape, so a field only
 * one dataset carries is not lost before anyone has looked at it.
 */

export interface NeutralExercise {
  /** Which dataset this record came from. */
  readonly source: string;
  /** That dataset's own identifier — the anchor for a later re-read. */
  readonly sourceId: string;
  /** The licence the record arrived under, from the source registry. */
  readonly license: string;

  /** The name as the source gives it. Never translated here. */
  readonly name: string;
  readonly description?: string | undefined;
  readonly instructions: readonly string[];

  /** Source vocabulary, verbatim. Comparison against ours happens later. */
  readonly primaryMuscles: readonly string[];
  readonly secondaryMuscles: readonly string[];
  readonly equipment: readonly string[];
  readonly category?: string | undefined;
  readonly forceType?: string | undefined;
  readonly mechanic?: string | undefined;
  readonly difficulty?: string | undefined;

  /** Names or ids of movements the source calls variations of this one. */
  readonly variantsOf: readonly string[];
  readonly media: readonly string[];

  /** Anything the common shape has no place for. */
  readonly raw: Readonly<Record<string, unknown>>;
}

/** A whole dataset as read, with what it took to read it. */
export interface NeutralDataset {
  readonly source: string;
  readonly license: string;
  /** When the artefact was downloaded — the version of the data. */
  readonly fetchedOn: string;
  readonly url: string;
  readonly exercises: readonly NeutralExercise[];
  /** Records the adapter could not read, with why. Never silently skipped. */
  readonly unreadable: readonly { readonly index: number; readonly reason: string }[];
}

/** Which fields a record is missing — the input to the gap report. */
export const NEUTRAL_FIELDS = [
  'description',
  'instructions',
  'primaryMuscles',
  'secondaryMuscles',
  'equipment',
  'category',
  'forceType',
  'mechanic',
  'difficulty',
  'variantsOf',
  'media',
] as const;

export type NeutralField = (typeof NEUTRAL_FIELDS)[number];

/**
 * Whether a record carries a field at all.
 *
 * An empty list counts as absent. That is the useful reading for a gap report:
 * "this dataset never says which equipment a movement needs" and "this dataset
 * says the movement needs no equipment" are indistinguishable from outside, and
 * treating them apart would invent a certainty the data does not carry.
 */
export function hasField(exercise: NeutralExercise, field: NeutralField): boolean {
  const value = exercise[field];

  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;

  return String(value).trim() !== '';
}

/** A helper for adapters: trims, drops blanks, keeps order, removes repeats. */
export function cleanList(values: readonly unknown[] | undefined): readonly string[] {
  if (!Array.isArray(values)) return [];

  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed !== '' && !out.includes(trimmed)) out.push(trimmed);
  }

  return out;
}

/** A helper for adapters: a single string field, or undefined when blank. */
export function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();

  return trimmed === '' ? undefined : trimmed;
}
