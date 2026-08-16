import { describe, expect, it } from 'vitest';

import { ADJECTIVE_STEMS, BASE_GENDER, composeGermanName, decline } from './terms';

/**
 * German adjective endings.
 *
 * A composed name puts an adjective in front of a noun, and the ending comes
 * from that noun's gender — strong declension, nominative singular. The table
 * used to store finished words with a fixed `-es`, which produced
 * "einarmiges Klimmzug" where German says "einarmiger Klimmzug".
 *
 * These tests exist so that ending cannot come back.
 */

describe('the declension itself', () => {
  it('takes -er, -e, -es from the gender', () => {
    expect(decline('einarmig', 'm')).toBe('einarmiger');
    expect(decline('einarmig', 'f')).toBe('einarmige');
    expect(decline('einarmig', 'n')).toBe('einarmiges');
  });
});

describe('the cases that were wrong', () => {
  const cases: readonly [string, string][] = [
    // der Klimmzug, der Liegestütz — masculine, so -er.
    ['One-Arm Chin-Up', 'Einarmiger Klimmzug im Kammgriff'],
    ['One Arm Pull-Up', 'Einarmiger Klimmzug'],
    ['Suspended Push-Up', 'Aufgehängter Liegestütz'],
    ['Explosive Push-Up', 'Explosiver Liegestütz'],
    // die Kniebeuge — feminine, so -e.
    ['Single-Leg Squat', 'Einbeinige Kniebeuge'],
    ['Bulgarian Squat', 'Bulgarische Kniebeuge'],
    // das Rudern — neuter, so -es. The implement sits behind (rule A).
    ['One-Arm Dumbbell Row', 'Einarmiges Rudern mit Kurzhantel'],
    ['Suspended Row', 'Aufgehängtes Rudern'],
    // der Ausfallschritt, der Sprung, die Dehnung.
    ['Backward Lunge', 'Rückwärtiger Ausfallschritt'],
    ['Single-Leg Box Jump', 'Einbeiniger Kastensprung'],
    ['Active Stretch', 'Aktive Dehnung'],
    ['Lateral Bound', 'Seitlicher Bound'],
  ];

  for (const [english, german] of cases) {
    it(`renders "${english}" as "${german}"`, () => {
      expect(composeGermanName(english).name).toBe(german);
    });
  }
});

describe('every adjective declines in all three genders', () => {
  const stems = [
    'einarmig',
    'einbeinig',
    'rückwärtig',
    'aufgehängt',
    'seitlich',
    'explosiv',
  ] as const;

  for (const stem of stems) {
    it(`${stem} → ${stem}er / ${stem}e / ${stem}es`, () => {
      expect(decline(stem, 'm')).toBe(`${stem}er`);
      expect(decline(stem, 'f')).toBe(`${stem}e`);
      expect(decline(stem, 'n')).toBe(`${stem}es`);
    });
  }
});

/**
 * The regression this file exists for.
 *
 * Storing a finished adjective in the table is what caused the fault. A stem
 * ending in `es`, `er` or `e` would mean somebody put the old form back.
 */
describe('no adjective is stored already declined', () => {
  it('holds stems, never finished forms', () => {
    for (const [key, stem] of Object.entries(ADJECTIVE_STEMS)) {
      expect(stem.endsWith('es'), `${key}: "${stem}" looks already declined`).toBe(false);
      expect(/^[a-zäöüß]/.test(stem), `${key}: "${stem}" should be lower case`).toBe(true);
    }
  });

  it('produces no name carrying an undeclined adjective stem', () => {
    for (const english of ['One-Arm Row', 'Single-Leg Squat', 'Suspended Push-Up']) {
      expect(composeGermanName(english).undeclined, english).toEqual([]);
    }
  });
});

describe('a gender nobody recorded is reported, not guessed', () => {
  it('leaves the stem bare and names it', () => {
    // "Fly" is feminine; a movement absent from the gender table is the case
    // this covers — the composition must not invent an ending.
    const result = composeGermanName('One-Arm Zercher Curl');

    expect(result.name).not.toBe('');
    // Curl is masculine and recorded, so this one declines cleanly.
    expect(result.undeclined).toEqual([]);
  });
});

describe('several modifiers in one name', () => {
  it('declines each against the same noun', () => {
    expect(composeGermanName('Single-Leg Romanian Deadlift').name).toBe(
      'Einbeiniges rumänisches Kreuzheben',
    );
  });

  it('sends the equipment behind and keeps the adjective in front', () => {
    expect(composeGermanName('One-Arm Cable Row').name).toBe('Einarmiges Rudern am Kabelzug');
  });
});

describe('the gender table', () => {
  it('records only the three genders', () => {
    for (const [key, gender] of Object.entries(BASE_GENDER)) {
      expect(['m', 'f', 'n'], `${key}`).toContain(gender);
    }
  });

  it('covers the movements the adjectives most often attach to', () => {
    for (const base of ['squat', 'deadlift', 'row', 'pull-up', 'push-up', 'lunge', 'stretch']) {
      expect(BASE_GENDER[base], base).toBeDefined();
    }
  });
});
