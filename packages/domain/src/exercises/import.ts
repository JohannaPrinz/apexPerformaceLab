import { z } from 'zod';

import {
  blocksImport,
  findDuplicates,
  type DuplicateCandidate,
  type DuplicateSubject,
} from './duplicates';
import { checkLicence, describeLicenceRefusal, licenceFor, type LicenceRefusal } from './sources';
import {
  EXERCISE_RELATIONSHIP_TYPES,
  pendingVocabularies,
  type ExerciseRelationshipType,
} from './taxonomy';

import { exerciseSchema } from './index';

/**
 * The shape a catalogue import arrives in.
 *
 * One file, one array of exercises, validated whole before anything is written.
 * That is the point: a catalogue of several hundred rows must not be applied
 * half-way, leaving a workspace with an exercise whose variants point at
 * movements that never landed.
 *
 * ## Keys, not positions
 *
 * Every entry names its `key`, and the key is what an import matches on. Running
 * the same file twice therefore updates rather than duplicates — the same
 * property `sourceId` gives for rows that came from elsewhere.
 *
 * ## Variants by key
 *
 * An entry lists its variants by **key**, not by id, because ids do not exist
 * until the rows are written. Resolution happens in one pass after every
 * exercise is in place, which is why a file is validated as a unit: a variant
 * naming a key the file does not contain is a broken file, not a broken row.
 *
 * ## The file is already in our vocabulary
 *
 * External spellings are translated **before** a file reaches here, by
 * `mapping.ts`. This schema validates against our own taxonomy and nothing
 * else, so an unmapped source value cannot slip through by looking plausible.
 */

export const exerciseImportEntrySchema = exerciseSchema.extend({
  /**
   * Other exercises in this file that are variations of this one.
   *
   * Symmetric: declaring it on one side is enough, and declaring it on both is
   * not an error. The importer stores one row per pair — see `variantPairKey`.
   */
  variantKeys: z.array(z.string()).max(30).default([]),
  /**
   * The same relationships, with their kind named.
   *
   * `variantKeys` above stays: a file written before relationships had a type
   * still imports, and its entries count as `related` — the reading that claims
   * the least. This field is how a file says more than that.
   *
   * Both may appear. Where the same pair is declared twice, the typed
   * declaration wins, because it carries information the flat one cannot.
   */
  relationships: z
    .array(
      z.object({
        key: z.string(),
        type: z.enum(EXERCISE_RELATIONSHIP_TYPES),
      }),
    )
    .max(30)
    .default([]),
});

export type ExerciseImportEntry = z.infer<typeof exerciseImportEntrySchema>;

export const exerciseImportSchema = z.object({
  /** Bumped when this file format changes, not when its contents do. */
  formatVersion: z.literal(1),
  /** Applied to every entry that does not carry its own. */
  source: z.string().trim().max(120).optional(),
  license: z.string().trim().max(200).optional(),
  exercises: z.array(exerciseImportEntrySchema).min(1).max(2000),
});

export type ExerciseImport = z.infer<typeof exerciseImportSchema>;

export type ImportProblem =
  | { readonly kind: 'DUPLICATE_KEY'; readonly key: string }
  | { readonly kind: 'UNKNOWN_VARIANT'; readonly key: string; readonly variantKey: string }
  | { readonly kind: 'CONFLICTING_RELATIONSHIP'; readonly key: string; readonly variantKey: string }
  | { readonly kind: 'SELF_VARIANT'; readonly key: string }
  | { readonly kind: 'DUPLICATE_SOURCE_ID'; readonly sourceId: string }
  | { readonly kind: 'MISSING_LICENCE'; readonly key: string }
  | { readonly kind: 'LICENCE_REFUSED'; readonly refusal: LicenceRefusal };

export interface ExerciseImportPlan {
  readonly entries: readonly ExerciseImportEntry[];
  /** One row per pair, smaller key first — the same rule ids follow. */
  readonly variantPairs: readonly {
    readonly a: string;
    readonly b: string;
    readonly type: ExerciseRelationshipType;
  }[];
  readonly problems: readonly ImportProblem[];
  /** Reported for review; only some of them stop the import. */
  readonly duplicates: readonly DuplicateCandidate[];
  /** Whether the importer may write. */
  readonly writable: boolean;
}

/**
 * Turns a validated file into what the importer will write, or into the reasons
 * it will not.
 *
 * Checks that only make sense across the whole file, or against the catalogue
 * as it already stands:
 *
 * - **A key appears once.** Two entries with one key is a file that cannot say
 *   which it means.
 * - **Every variant key exists in the file.** Variants are references; a
 *   reference to something absent is not a variant.
 * - **A `sourceId` appears once**, or a re-import would collapse two source rows
 *   onto one.
 * - **Imported rows carry a licence**, and it is the licence the source registry
 *   holds. `source` without `license` is exactly the state that makes a later
 *   redistribution question unanswerable.
 * - **The source is approved.** Registered, understood, and cleared.
 * - **Duplicates are surfaced.** A repeated source row blocks; a name collision
 *   is reported for a person to judge.
 *
 * `existing` is what the catalogue already holds, so a second run recognises
 * its own rows instead of reporting the whole file as duplicated.
 */
export function planExerciseImport(
  file: ExerciseImport,
  existing: readonly DuplicateSubject[] = [],
): ExerciseImportPlan {
  const problems: ImportProblem[] = [];

  const entries = file.exercises.map((entry) => {
    const source = entry.source ?? file.source;

    return {
      ...entry,
      source,
      // The registry's licence wins over the file's. A file cannot grant itself
      // terms the source did not give — and `checkLicence` refuses outright if
      // the two disagree, so this only fills a blank.
      license: entry.license ?? file.license ?? (source ? licenceFor(source) : undefined),
    };
  });

  const seenKeys = new Set<string>();
  for (const entry of entries) {
    if (seenKeys.has(entry.key)) problems.push({ kind: 'DUPLICATE_KEY', key: entry.key });
    seenKeys.add(entry.key);
  }

  const seenSourceIds = new Set<string>();
  for (const entry of entries) {
    if (entry.sourceId === undefined) continue;
    if (seenSourceIds.has(entry.sourceId)) {
      problems.push({ kind: 'DUPLICATE_SOURCE_ID', sourceId: entry.sourceId });
    }
    seenSourceIds.add(entry.sourceId);
  }

  for (const entry of entries) {
    if (entry.source !== undefined && entry.license === undefined) {
      problems.push({ kind: 'MISSING_LICENCE', key: entry.key });
    }
  }

  // Once per distinct source, not once per row: a file of 300 wger exercises
  // should say "wger is not approved" once.
  for (const source of new Set(entries.map((entry) => entry.source))) {
    const verdict = checkLicence(source, entries.find((entry) => entry.source === source)?.license);

    if (!verdict.ok) problems.push({ kind: 'LICENCE_REFUSED', refusal: verdict.refusal });
  }

  const pairs = new Map<string, { a: string; b: string; type: ExerciseRelationshipType }>();

  /**
   * One pair, whatever side declared it and however often.
   *
   * The untyped form is read first so a typed declaration of the same pair
   * overwrites it — an upgrade of what is known about the pair, never a
   * downgrade. Two *typed* declarations that disagree are reported rather than
   * silently resolved: the file contradicts itself and a person should say
   * which reading is meant.
   */
  const record = (
    key: string,
    otherKey: string,
    type: ExerciseRelationshipType,
    typed: boolean,
  ): void => {
    if (otherKey === key) {
      problems.push({ kind: 'SELF_VARIANT', key });

      return;
    }

    if (!seenKeys.has(otherKey)) {
      problems.push({ kind: 'UNKNOWN_VARIANT', key, variantKey: otherKey });

      return;
    }

    // Declared on either side, stored once — the pair is the fact, and the
    // order is only how it is written down.
    const [a, b] = key < otherKey ? [key, otherKey] : [otherKey, key];
    const id = `${a}|${b}`;
    const existingPair = pairs.get(id);

    if (existingPair !== undefined && typed) {
      if (typedPairs.has(id) && existingPair.type !== type) {
        problems.push({ kind: 'CONFLICTING_RELATIONSHIP', key: a, variantKey: b });

        return;
      }
    } else if (existingPair !== undefined) {
      // An untyped declaration never overwrites what is already known.
      return;
    }

    if (typed) typedPairs.add(id);
    pairs.set(id, { a, b, type });
  };

  const typedPairs = new Set<string>();

  for (const entry of entries) {
    for (const variantKey of entry.variantKeys) record(entry.key, variantKey, 'related', false);
  }

  for (const entry of entries) {
    for (const relationship of entry.relationships) {
      record(entry.key, relationship.key, relationship.type, true);
    }
  }

  const duplicates = findDuplicates(entries, existing).filter(
    // A key already in the catalogue is how an update is expressed, not a
    // problem — that is precisely what makes a re-import idempotent.
    (candidate) => candidate.reason !== 'SAME_KEY',
  );

  const writable = problems.length === 0 && !duplicates.some(blocksImport);

  return { entries, variantPairs: [...pairs.values()], problems, duplicates, writable };
}

export function describeImportProblem(problem: ImportProblem): string {
  switch (problem.kind) {
    case 'DUPLICATE_KEY':
      return `"${problem.key}" appears more than once.`;
    case 'UNKNOWN_VARIANT':
      return `"${problem.key}" names "${problem.variantKey}" as a variant, but the file has no such exercise.`;
    case 'CONFLICTING_RELATIONSHIP':
      return `"${problem.key}" and "${problem.variantKey}" are declared with two different relationship types.`;
    case 'SELF_VARIANT':
      return `"${problem.key}" lists itself as a variant.`;
    case 'DUPLICATE_SOURCE_ID':
      return `Two exercises carry the source id "${problem.sourceId}", so a re-import could not tell them apart.`;
    case 'MISSING_LICENCE':
      return `"${problem.key}" names a source but no licence. Imported data must record the terms it arrived under.`;
    case 'LICENCE_REFUSED':
      return describeLicenceRefusal(problem.refusal);
  }
}

/**
 * Whether the catalogue can be imported at all.
 *
 * A file classifying exercises by muscle, equipment or category cannot be
 * validated while those vocabularies are empty — every value would be rejected.
 * This says so once instead of letting an import fail row by row with the same
 * message several hundred times.
 */
export function importReadiness(): { ready: boolean; pending: readonly string[] } {
  const pending = pendingVocabularies();

  return { ready: pending.length === 0, pending };
}
