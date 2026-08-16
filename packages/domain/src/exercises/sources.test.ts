import { describe, expect, it } from 'vitest';

import {
  checkLicence,
  describeLicenceRefusal,
  EXERCISE_SOURCES,
  findExerciseSource,
  licenceFor,
} from './sources';

/**
 * `license` on every row is only worth having if something checks it was filled
 * in truthfully rather than by whoever ran the import.
 */

describe('the source registry', () => {
  it('records the licences that were actually verified', () => {
    expect(EXERCISE_SOURCES.wger.license).toBe('CC-BY-SA-4.0');
    expect(EXERCISE_SOURCES.exercemus.license).toBe('MIT');
  });

  it('marks wger as share-alike, which is the material question', () => {
    expect(EXERCISE_SOURCES.wger.shareAlike).toBe(true);
  });

  it('records when each was checked, so a reader knows how stale it is', () => {
    for (const source of Object.values(EXERCISE_SOURCES)) {
      expect(source.checkedOn, source.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  /**
   * Both are registered and understood, neither is cleared. Exercemus states
   * MIT but is curated partly from wger, which is CC-BY-SA — a conflict this
   * registry records rather than resolves.
   */
  /**
   * No **external** source is cleared for import. `editorial` is not external:
   * it marks text authored here, and there is no third party to clear it with.
   * A source with a URL is somebody else's data and needs a decision in writing.
   */
  /**
   * Only the public-domain dataset is cleared.
   *
   * wrkout is approved because the Unlicense lets its prose ship. wger is
   * CC-BY-SA — share-alike, which a commercial catalogue cannot carry — and
   * Exercemus claims MIT over material partly derived from wger. Both stayed
   * comparison sources, and this test is what keeps that decision from eroding.
   */
  it('approves the public-domain source and no other external one', () => {
    for (const source of Object.values(EXERCISE_SOURCES)) {
      const external = source.url !== '';

      if (external && source.key !== 'wrkout') {
        expect(source.approved, source.key).toBe(false);
      }

      expect(source.note.length, source.key).toBeGreaterThan(0);
    }
  });

  it('clears wrkout, whose licence is public domain', () => {
    const wrkout = findExerciseSource('wrkout');

    expect(wrkout?.approved).toBe(true);
    expect(wrkout?.shareAlike).toBe(false);
    expect(wrkout?.license).toContain('Public Domain');
  });

  it('approves our own editorial text, which has no third party', () => {
    const editorial = findExerciseSource('editorial');

    expect(editorial?.approved).toBe(true);
    expect(editorial?.url).toBe('');
    expect(editorial?.shareAlike).toBe(false);
  });

  it('looks a source up, and reports an unknown one as unknown', () => {
    expect(findExerciseSource('wger')?.name).toBe('wger');
    expect(findExerciseSource('some-other-dataset')).toBeUndefined();
    expect(licenceFor('exercemus')).toBe('MIT');
  });
});

describe('the licence check', () => {
  it('allows a row with no source — it was authored here', () => {
    expect(checkLicence(undefined, undefined)).toEqual({ ok: true });
  });

  it('refuses a source nobody registered', () => {
    const result = checkLicence('some-scraper', 'MIT');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.refusal.kind).toBe('UNKNOWN_SOURCE');
  });

  it('refuses a registered but unapproved source, and passes the reason on', () => {
    const result = checkLicence('wger', 'CC-BY-SA-4.0');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.refusal.kind).toBe('NOT_APPROVED');
    expect(result.ok === false && describeLicenceRefusal(result.refusal).toLowerCase()).toContain(
      'share-alike',
    );
  });

  /**
   * Preferring either side silently would make the recorded licence fiction.
   * The import stops instead.
   */
  it('refuses a file claiming terms the registry disagrees with', () => {
    const result = checkLicence('wger', 'MIT');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.refusal.kind).toBe('LICENCE_MISMATCH');
    expect(result.ok === false && describeLicenceRefusal(result.refusal)).toContain('CC-BY-SA-4.0');
  });

  it('checks the mismatch before the approval, so the worse problem is named first', () => {
    // A mismatch means someone recorded the wrong terms; approval is a decision
    // still to be taken. The first is a mistake, the second is a state.
    const result = checkLicence('exercemus', 'GPL-3.0');

    expect(result.ok === false && result.refusal.kind).toBe('LICENCE_MISMATCH');
  });
});

describe('the refusal messages', () => {
  it('say what to do, not merely that something is wrong', () => {
    expect(describeLicenceRefusal({ kind: 'UNKNOWN_SOURCE', source: 'x' })).toContain('Register');
    expect(
      describeLicenceRefusal({ kind: 'NOT_APPROVED', source: 'wger', note: 'settle it' }),
    ).toContain('settle it');
  });
});
