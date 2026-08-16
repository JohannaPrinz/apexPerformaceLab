/**
 * Finding the same movement twice.
 *
 * A catalogue assembled from two datasets will contain the same exercise under
 * different names — and a curated catalogue of 250–350 is exactly the situation
 * where that matters, because the alternative is a coach scrolling past
 * "Barbell Bench Press", "Bench Press, Barbell" and "Flachbankdrücken" looking
 * for one movement.
 *
 * ## Suspicion, never deletion
 *
 * Nothing here removes anything. A duplicate is *reported* with what makes it
 * look like one, and a person decides. That is deliberate: near-identical names
 * routinely belong to genuinely different movements — a close-grip bench press
 * is not a bench press — and an importer that merged them automatically would
 * quietly destroy the distinction the catalogue exists to make.
 */

/**
 * Reduces a name to what two spellings of one movement share.
 *
 * Case, punctuation and word order are dropped; so are the filler words that
 * differ between datasets without changing the movement. Equipment words are
 * **kept**, because "barbell row" and "dumbbell row" are two exercises.
 */
const NOISE = new Set([
  'the',
  'a',
  'an',
  'with',
  'and',
  'or',
  'for',
  'of',
  'on',
  'to',
  'exercise',
  'variation',
  'version',
]);

export function nameFingerprint(name: string): string {
  return (
    name
      .toLowerCase()
      // German folding **before** decomposition, and this order matters: the
      // convention is ü → ue, not ü → u. Stripping the diaeresis first would
      // make "Bankdrücken" fold to "bankdrucken" while a catalogue that spelled
      // it out gives "bankdruecken", and the two would never meet.
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFKD')
      // Any remaining marks — French, Scandinavian — drop to the base letter.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((word) => word !== '' && !NOISE.has(word))
      .sort()
      .join(' ')
  );
}

export type DuplicateReason =
  /** Same stable identifier — the same row, definitively. */
  | 'SAME_KEY'
  /** Same source row, so a re-import rather than a second movement. */
  | 'SAME_SOURCE_ID'
  /** Names reduce to the same words. Suspicion only. */
  | 'SAME_NAME_FINGERPRINT';

export interface DuplicateCandidate {
  readonly key: string;
  readonly otherKey: string;
  readonly reason: DuplicateReason;
  readonly detail: string;
}

export interface DuplicateSubject {
  readonly key: string;
  readonly name: string;
  readonly canonicalName: string;
  readonly source?: string | undefined;
  readonly sourceId?: string | undefined;
}

/**
 * Compares entries against each other and against what is already stored.
 *
 * `existing` is what the catalogue already holds, so a second import run
 * recognises its own rows instead of reporting the whole file as duplicated.
 *
 * Both names are fingerprinted. A German name colliding is as much a signal as
 * an English one — more, in fact, since we choose the German names ourselves
 * and a collision there is our own doing.
 */
export function findDuplicates(
  entries: readonly DuplicateSubject[],
  existing: readonly DuplicateSubject[] = [],
): readonly DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];

  const byKey = new Map<string, DuplicateSubject>();
  const bySourceId = new Map<string, DuplicateSubject>();
  const byFingerprint = new Map<string, DuplicateSubject>();

  const remember = (subject: DuplicateSubject) => {
    byKey.set(subject.key, subject);
    if (subject.source !== undefined && subject.sourceId !== undefined) {
      bySourceId.set(`${subject.source}|${subject.sourceId}`, subject);
    }
    for (const fingerprint of fingerprintsOf(subject)) {
      if (!byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, subject);
    }
  };

  for (const subject of existing) remember(subject);

  for (const entry of entries) {
    const sameKey = byKey.get(entry.key);
    if (sameKey) {
      candidates.push({
        key: entry.key,
        otherKey: sameKey.key,
        reason: 'SAME_KEY',
        detail: `"${entry.key}" already exists. A second import of the same key updates it rather than adding a movement.`,
      });
    }

    if (entry.source !== undefined && entry.sourceId !== undefined) {
      const marker = `${entry.source}|${entry.sourceId}`;
      const sameSource = bySourceId.get(marker);
      if (sameSource && sameSource.key !== entry.key) {
        candidates.push({
          key: entry.key,
          otherKey: sameSource.key,
          reason: 'SAME_SOURCE_ID',
          detail: `Both carry ${marker}, so one source row would become two exercises.`,
        });
      }
    }

    for (const fingerprint of fingerprintsOf(entry)) {
      const sameName = byFingerprint.get(fingerprint);
      if (sameName && sameName.key !== entry.key) {
        candidates.push({
          key: entry.key,
          otherKey: sameName.key,
          reason: 'SAME_NAME_FINGERPRINT',
          detail: `"${entry.name}" and "${sameName.name}" reduce to the same words. They may still be different movements — decide before merging.`,
        });
        break;
      }
    }

    remember(entry);
  }

  return candidates;
}

function fingerprintsOf(subject: DuplicateSubject): readonly string[] {
  const german = nameFingerprint(subject.name);
  const english = nameFingerprint(subject.canonicalName);

  return german === english ? [german] : [german, english];
}

/** Which candidates stop an import, and which are only worth a look. */
export function blocksImport(candidate: DuplicateCandidate): boolean {
  // A name collision is a judgement call; a repeated source row is not.
  return candidate.reason === 'SAME_SOURCE_ID';
}
