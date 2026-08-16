import { z } from 'zod';

/**
 * The external datasets the importer knows how to read.
 *
 * A source is registered here with the licence its data actually arrives
 * under. Nothing is imported from a source this file does not list — not as a
 * bureaucratic hurdle, but because `license` on every row is only worth having
 * if something checks that it was filled in truthfully rather than by whoever
 * ran the import.
 *
 * ## Verified, not remembered
 *
 * The values below were read from the sources in August 2026, not recalled:
 * wger's API for its vocabularies and its published licence, and the Exercemus
 * repository for its dataset and stated licence. `checkedOn` records when, so a
 * later reader knows how stale this is.
 *
 * ## A licence conflict this file records rather than resolves
 *
 * Exercemus states MIT, and its own description says the list is *curated from
 * exercemus, wger.de and exercises.json*. wger's exercise data is CC-BY-SA 4.0,
 * which is a **share-alike** licence: derivative datasets must be released
 * under the same terms. MIT redistribution of CC-BY-SA content is not obviously
 * permitted, so an Exercemus row that originated at wger may carry a licence
 * that does not hold.
 *
 * ## The decision that was taken
 *
 * **Only public-domain and self-authored text reaches the catalogue.** wger and
 * Exercemus stay registered and are read — comparing our coverage against them
 * is useful and lawful — but neither is a source of rows. That closes the
 * share-alike question by declining it rather than by arguing it, and it is why
 * `approved` is false for both and will stay false.
 *
 * The importer refuses to write rows from an unapproved source, so the decision
 * is enforced rather than remembered.
 */

export const EXERCISE_SOURCES = {
  /**
   * Written by us.
   *
   * Not a dataset and not a fetch target: `editorial` marks an exercise whose
   * name, description and instructions were **authored here**, because no
   * licence-clear source carried it. Endurance is the clearest case — the
   * material exists almost only in wger, whose text we may not take.
   *
   * It is a source rather than an absence of one so that provenance stays a
   * complete answer: "where did this text come from" is answerable for every
   * row, and "we wrote it" is a different answer from "nobody recorded it".
   *
   * Approved by definition. There is no third party to clear it with.
   */
  editorial: {
    key: 'editorial',
    name: 'Apex OS editorial',
    url: '',
    license: 'Proprietary — authored for Apex OS',
    shareAlike: false,
    checkedOn: '2026-08-13',
    approved: true,
    note: 'Authored here. Used where no licence-clear source carries the movement.',
  },
  /**
   * The dataset the catalogue is built from.
   *
   * Public domain under the Unlicense — the one external source whose prose may
   * be shipped, which is why it was chosen as primary and why wger and Exercemus
   * were used for comparison only. The licence is recorded as the project found
   * it; nothing here assumes terms beyond what the repository states.
   *
   * Approved for import: this is the registration of a decision already taken
   * when the catalogue was curated, not a new one.
   */
  wrkout: {
    key: 'wrkout',
    name: 'wrkout / exercises.json',
    url: 'https://github.com/wrkout/exercises.json',
    license: 'Public Domain (Unlicense)',
    shareAlike: false,
    checkedOn: '2026-08-16',
    approved: true,
    note: 'Public domain. Primary source of the catalogue; its text may be shipped.',
  },
  wger: {
    key: 'wger',
    name: 'wger',
    url: 'https://wger.de/api/v2/',
    /** Verified from wger's own documentation and community guidance. */
    license: 'CC-BY-SA-4.0',
    /**
     * Share-alike: a derivative dataset must be published under the same
     * licence. For a catalogue shipped inside a commercial product this is the
     * material question, and it is the reason `approved` is false.
     */
    shareAlike: true,
    checkedOn: '2026-08-12',
    /** Set to true only on an explicit, recorded decision. */
    approved: false,
    note: 'Decided, not pending: wger is a comparison source only. Its CC-BY-SA share-alike obligation is not one this product takes on, so no wger text or row is ever shipped. It stays registered because reading it to check our coverage is legitimate and useful.',
  },
  exercemus: {
    key: 'exercemus',
    name: 'Exercemus',
    url: 'https://github.com/exercemus/exercises',
    license: 'MIT',
    shareAlike: false,
    checkedOn: '2026-08-12',
    approved: false,
    note: 'Comparison source only. States MIT, but is curated partly from wger.de (CC-BY-SA 4.0), so the MIT grant cannot be relied on row by row without establishing where each row came from. Not worth the exposure for a catalogue we can source from the public domain instead.',
  },
} as const;

export type ExerciseSourceKey = keyof typeof EXERCISE_SOURCES;

export interface ExerciseSource {
  readonly key: string;
  readonly name: string;
  readonly url: string;
  readonly license: string;
  readonly shareAlike: boolean;
  readonly checkedOn: string;
  readonly approved: boolean;
  readonly note: string;
}

export const exerciseSourceKeySchema = z.enum(
  Object.keys(EXERCISE_SOURCES) as [ExerciseSourceKey, ...ExerciseSourceKey[]],
);

export function findExerciseSource(key: string): ExerciseSource | undefined {
  return (EXERCISE_SOURCES as Record<string, ExerciseSource>)[key];
}

export type LicenceRefusal =
  | { readonly kind: 'UNKNOWN_SOURCE'; readonly source: string }
  | { readonly kind: 'NOT_APPROVED'; readonly source: string; readonly note: string }
  | {
      readonly kind: 'LICENCE_MISMATCH';
      readonly source: string;
      readonly declared: string;
      readonly expected: string;
    };

/**
 * Whether rows from a source may be written, and under what licence.
 *
 * Three refusals:
 *
 * 1. **Unknown source.** A licence nobody checked is not a licence.
 * 2. **Not approved.** Registered and understood, but not cleared for use. This
 *    is where both current sources stand.
 * 3. **Licence mismatch.** The file claims terms the registry does not agree
 *    with. Silently preferring either one would make the recorded licence
 *    fiction; the import stops instead.
 *
 * A row with **no** source is always allowed: it was authored here.
 */
export function checkLicence(
  source: string | undefined,
  declaredLicense: string | undefined,
): { ok: true } | { ok: false; refusal: LicenceRefusal } {
  if (source === undefined) return { ok: true };

  const registered = findExerciseSource(source);
  if (!registered) return { ok: false, refusal: { kind: 'UNKNOWN_SOURCE', source } };

  if (declaredLicense !== undefined && declaredLicense !== registered.license) {
    return {
      ok: false,
      refusal: {
        kind: 'LICENCE_MISMATCH',
        source,
        declared: declaredLicense,
        expected: registered.license,
      },
    };
  }

  if (!registered.approved) {
    return {
      ok: false,
      refusal: { kind: 'NOT_APPROVED', source, note: registered.note },
    };
  }

  return { ok: true };
}

export function describeLicenceRefusal(refusal: LicenceRefusal): string {
  switch (refusal.kind) {
    case 'UNKNOWN_SOURCE':
      return `"${refusal.source}" is not a registered source. Register it with its licence before importing from it.`;
    case 'NOT_APPROVED':
      return `"${refusal.source}" is registered but not approved for import. ${refusal.note}`;
    case 'LICENCE_MISMATCH':
      return `The file declares "${refusal.declared}" for "${refusal.source}", but that source is registered as "${refusal.expected}". One of the two is wrong, and a recorded licence has to be right.`;
  }
}

/** The licence the registry holds for a source — what gets written on the row. */
export function licenceFor(source: string): string | undefined {
  return findExerciseSource(source)?.license;
}
