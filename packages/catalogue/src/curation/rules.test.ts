import { describe, expect, it } from 'vitest';

import { assignBatches, type Batch } from './batches';
import { globalRuleChanges } from './rules';
import { composeGermanName, EQUIPMENT_PHRASES } from './terms';

/**
 * The catalogue-wide rules, and the one property that makes a blockwise review
 * possible at all: that the blocks hold still.
 */

describe('rule A — the implement goes behind the movement', () => {
  const cases: readonly [string, string][] = [
    ['Dumbbell Bench Press', 'Bankdrücken mit Kurzhanteln'],
    ['Cable Shoulder Press', 'Schulterdrücken am Kabelzug'],
    ['Barbell Deadlift', 'Kreuzheben mit Langhantel'],
    ['Squat with Bands', 'Kniebeuge mit Band'],
    // One arm means one implement.
    ['One-Arm Dumbbell Row', 'Einarmiges Rudern mit Kurzhantel'],
    // Adjectives keep their place in front; only equipment moves.
    ['Kneeling Cable Triceps Extension', 'Kniendes Trizepsdrücken am Kabelzug'],
  ];

  for (const [english, german] of cases) {
    it(`renders "${english}" as "${german}"`, () => {
      expect(composeGermanName(english).name).toBe(german);
    });
  }

  it('produces no equipment prefix compound', () => {
    const prefixes = Object.keys(EQUIPMENT_PHRASES);

    for (const [english] of cases) {
      const { name } = composeGermanName(english);

      for (const prefix of prefixes) {
        expect(name.startsWith(`${prefix}-`), `${name} starts with ${prefix}-`).toBe(false);
      }
    }
  });

  it('leaves a term that is not an implement in front', () => {
    // "Weighted" is not equipment — "Sprungkniebeuge mit Gewichts" is not German.
    expect(composeGermanName('Weighted Jump Squat').name).toBe('Gewichts-Sprungkniebeuge');
  });
});

describe('rules D, E and F', () => {
  const subject = (over: Partial<Parameters<typeof globalRuleChanges>[0]>) =>
    globalRuleChanges({
      canonicalName: 'X',
      category: 'strength',
      forceType: 'push',
      mechanic: 'compound',
      movementPattern: 'squat',
      ...over,
    });

  it('D moves an explosive jump to plyometrics, load or no load', () => {
    const changes = subject({ canonicalName: 'Weighted Jump Squat', movementPattern: 'jump' });

    expect(changes.find((change) => change.rule === 'D')?.to).toBe('plyometrics');
  });

  it('D leaves olympic weightlifting where it is', () => {
    const changes = subject({ category: 'olympic_weightlifting', movementPattern: 'jump' });

    expect(changes.some((change) => change.rule === 'D')).toBe(false);
  });

  it('E pulls the whole hinge family', () => {
    for (const name of ['Good Morning', 'Stiff Leg Barbell Good Morning', 'Romanian Deadlift']) {
      expect(
        subject({ canonicalName: name }).find((change) => change.field === 'forceType')?.to,
      ).toBe('pull');
    }
  });

  it('F pulls front and lateral raises alike', () => {
    for (const name of ['Front Raise (Cable)', 'Side Laterals to Front Raise']) {
      expect(
        subject({ canonicalName: name }).find((change) => change.field === 'forceType')?.to,
      ).toBe('pull');
    }
  });

  it('reports nothing when the value is already right', () => {
    expect(subject({ canonicalName: 'Barbell Deadlift', forceType: 'pull' })).toEqual([]);
  });

  it('never invents a force type where the category leaves it open', () => {
    // Stability and endurance still carry no force type by decision. Mobility
    // used to be in this list; rule H now fills it deliberately.
    for (const category of ['stability', 'endurance']) {
      expect(subject({ canonicalName: 'Good Morning', forceType: null, category })).toEqual([]);
    }
  });
});

describe('rule H — mobility is static and isolated', () => {
  const mobility = (forceType: string | null, mechanic: string | null) =>
    globalRuleChanges({
      canonicalName: 'Hamstring-SMR',
      category: 'mobility',
      forceType,
      mechanic,
      movementPattern: 'mobility',
    });

  it('fills both fields where they were left open', () => {
    expect(mobility(null, null).map((change) => [change.field, change.to])).toEqual([
      ['forceType', 'static'],
      ['mechanic', 'isolation'],
    ]);
  });

  it('reports nothing where they already say so', () => {
    expect(mobility('static', 'isolation')).toEqual([]);
  });

  it('leaves the hinge and raise rules out of mobility', () => {
    // A mobility entry called "… Deadlift" must not be pulled by rule E: the
    // category answer is complete on its own.
    const changes = globalRuleChanges({
      canonicalName: 'Romanian Deadlift Stretch',
      category: 'mobility',
      forceType: 'static',
      mechanic: 'isolation',
      movementPattern: 'mobility',
    });

    expect(changes).toEqual([]);
  });
});

/**
 * Rule B. This is the test the review process depends on: a rename must not
 * move an exercise into a block somebody has already signed off.
 */
describe('rule B — frozen block membership', () => {
  const existing: readonly Batch[] = [
    { block: 1, title: 'Strength – Teil 1', exercises: ['Front Barbell Squat', 'Chin-Up'] },
    { block: 2, title: 'Strength – Teil 2', exercises: ['Good Morning'] },
  ];

  const options = { maximum: 35, label: (category: string) => category };

  it('keeps an exercise in its block after it is renamed', () => {
    // The German name is what changed — "Front Barbell Squat" is now
    // "Frontkniebeuge", which sorts elsewhere entirely.
    const result = assignBatches(
      existing,
      [
        { canonicalName: 'Front Barbell Squat', category: 'strength' },
        { canonicalName: 'Chin-Up', category: 'strength' },
        { canonicalName: 'Good Morning', category: 'strength' },
      ],
      options,
    );

    expect(result.find((batch) => batch.block === 1)?.exercises).toContain('Front Barbell Squat');
    expect(result.find((batch) => batch.block === 2)?.exercises).toEqual(['Good Morning']);
  });

  it('puts a new exercise in a new block, never into a reviewed one', () => {
    const result = assignBatches(
      existing,
      [
        { canonicalName: 'Front Barbell Squat', category: 'strength' },
        { canonicalName: 'Chin-Up', category: 'strength' },
        { canonicalName: 'Good Morning', category: 'strength' },
        { canonicalName: 'Brand New Exercise', category: 'strength' },
      ],
      options,
    );

    expect(result.find((batch) => batch.block === 1)?.exercises).toHaveLength(2);
    expect(result.find((batch) => batch.block === 2)?.exercises).toHaveLength(1);
    expect(result.at(-1)?.exercises).toEqual(['Brand New Exercise']);
    expect(result.at(-1)?.block).toBe(3);
  });

  it('drops an exercise that left the selection', () => {
    const result = assignBatches(
      existing,
      [{ canonicalName: 'Chin-Up', category: 'strength' }],
      options,
    );

    expect(result.flatMap((batch) => batch.exercises)).toEqual(['Chin-Up']);
  });

  it('lists every exercise exactly once', () => {
    const result = assignBatches(
      existing,
      [
        { canonicalName: 'Front Barbell Squat', category: 'strength' },
        { canonicalName: 'Chin-Up', category: 'strength' },
        { canonicalName: 'Good Morning', category: 'strength' },
        { canonicalName: 'One', category: 'mobility' },
        { canonicalName: 'Two', category: 'mobility' },
      ],
      options,
    );

    const all = result.flatMap((batch) => batch.exercises);

    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(5);
  });

  it('changes nothing when nothing changed', () => {
    const exercises = [
      { canonicalName: 'Front Barbell Squat', category: 'strength' },
      { canonicalName: 'Chin-Up', category: 'strength' },
      { canonicalName: 'Good Morning', category: 'strength' },
    ];

    expect(assignBatches(assignBatches(existing, exercises, options), exercises, options)).toEqual(
      assignBatches(existing, exercises, options),
    );
  });
});
