import { describe, expect, it } from 'vitest';

import { blocksImport, findDuplicates, nameFingerprint } from './duplicates';

/**
 * A catalogue assembled from two datasets will hold the same movement twice
 * under different names. Detection is suspicion, never deletion: near-identical
 * names routinely belong to genuinely different exercises.
 */

const subject = (
  key: string,
  name: string,
  canonicalName = name,
  source?: string,
  sourceId?: string,
) => ({ key, name, canonicalName, source, sourceId });

describe('the name fingerprint', () => {
  it('ignores case, punctuation and word order', () => {
    expect(nameFingerprint('Bench Press, Barbell')).toBe(nameFingerprint('barbell bench press'));
  });

  it('ignores the filler words the datasets differ in', () => {
    expect(nameFingerprint('Bench Press with a Barbell')).toBe(
      nameFingerprint('Barbell Bench Press'),
    );
  });

  it('folds German accents rather than splitting on them', () => {
    expect(nameFingerprint('Bankdrücken')).toBe(nameFingerprint('Bankdruecken'));
    expect(nameFingerprint('Straßenlauf')).toBe(nameFingerprint('Strassenlauf'));
  });

  /**
   * Equipment words are kept. A barbell row and a dumbbell row are two
   * exercises, and a fingerprint that merged them would be worse than none.
   */
  it('keeps the words that make two movements different', () => {
    expect(nameFingerprint('Barbell Row')).not.toBe(nameFingerprint('Dumbbell Row'));
    expect(nameFingerprint('Bench Press')).not.toBe(nameFingerprint('Close-Grip Bench Press'));
  });
});

describe('finding duplicates within a file', () => {
  it('reports two entries whose names reduce to the same words', () => {
    const found = findDuplicates([
      subject('bench_press', 'Bankdrücken', 'Barbell Bench Press'),
      subject('barbell_bench_press', 'Langhantel-Bankdrücken', 'Bench Press, Barbell'),
    ]);

    expect(found.map((candidate) => candidate.reason)).toContain('SAME_NAME_FINGERPRINT');
  });

  /**
   * The counter-case, and the reason the fingerprint keeps equipment words:
   * adding one is what distinguishes two real movements, so it must not fold
   * them together.
   */
  it('does not merge a movement with its equipment-qualified sibling', () => {
    const found = findDuplicates([
      subject('bench_press', 'Bankdrücken', 'Bench Press'),
      subject('dumbbell_bench_press', 'Kurzhantel-Bankdrücken', 'Dumbbell Bench Press'),
    ]);

    expect(found).toEqual([]);
  });

  it('catches a collision on the German name we chose ourselves', () => {
    const found = findDuplicates([
      subject('back_squat', 'Kniebeuge', 'Back Squat'),
      subject('barbell_squat', 'Kniebeuge', 'Barbell Squat'),
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]?.reason).toBe('SAME_NAME_FINGERPRINT');
  });

  it('reports two entries claiming the same source row', () => {
    const found = findDuplicates([
      subject('a', 'Erste', 'First', 'wger', '42'),
      subject('b', 'Zweite', 'Second', 'wger', '42'),
    ]);

    expect(found.map((candidate) => candidate.reason)).toContain('SAME_SOURCE_ID');
  });

  it('does not confuse the same id from two different sources', () => {
    const found = findDuplicates([
      subject('a', 'Erste', 'First', 'wger', '42'),
      subject('b', 'Zweite', 'Second', 'exercemus', '42'),
    ]);

    expect(found).toEqual([]);
  });

  it('leaves genuinely different movements alone', () => {
    const found = findDuplicates([
      subject('bench_press', 'Bankdrücken', 'Bench Press'),
      subject('incline_bench_press', 'Schrägbankdrücken', 'Incline Bench Press'),
      subject('overhead_press', 'Schulterdrücken', 'Overhead Press'),
    ]);

    expect(found).toEqual([]);
  });
});

describe('finding duplicates against what is already stored', () => {
  const stored = [subject('bench_press', 'Bankdrücken', 'Bench Press', 'wger', '192')];

  it('recognises a re-import of its own row rather than calling it a duplicate', () => {
    const found = findDuplicates(
      [subject('bench_press', 'Bankdrücken', 'Bench Press', 'wger', '192')],
      stored,
    );

    // Same key: that is how an update is expressed, and the only report is the
    // key match itself.
    expect(found.every((candidate) => candidate.reason === 'SAME_KEY')).toBe(true);
  });

  it('reports a new key carrying an already-imported source row', () => {
    const found = findDuplicates(
      [subject('bench_press_v2', 'Bankdrücken neu', 'Bench Press v2', 'wger', '192')],
      stored,
    );

    expect(found.map((candidate) => candidate.reason)).toContain('SAME_SOURCE_ID');
  });

  it('reports a new movement whose name collides with a stored one', () => {
    const found = findDuplicates(
      [subject('flat_press', 'Flachbankdrücken', 'Bench Press')],
      stored,
    );

    expect(found.map((candidate) => candidate.reason)).toContain('SAME_NAME_FINGERPRINT');
  });
});

/**
 * A repeated source row is a fact about the file and stops the import. A name
 * collision is a judgement — a person decides whether two similar names are one
 * movement, and an importer that merged them would destroy the distinction the
 * catalogue exists to make.
 */
describe('which candidates stop an import', () => {
  it('blocks on a repeated source row', () => {
    expect(blocksImport({ key: 'a', otherKey: 'b', reason: 'SAME_SOURCE_ID', detail: '' })).toBe(
      true,
    );
  });

  it('only reports a name collision', () => {
    expect(
      blocksImport({ key: 'a', otherKey: 'b', reason: 'SAME_NAME_FINGERPRINT', detail: '' }),
    ).toBe(false);
  });
});
