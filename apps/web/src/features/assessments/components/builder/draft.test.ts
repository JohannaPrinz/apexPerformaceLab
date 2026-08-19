import { describe, expect, it } from 'vitest';

import { findMeasurementTemplate, moduleConfigurationSchema } from '@apex/domain';

import {
  BUILDER_STEPS,
  canLeaveStep,
  draftFromConfiguration,
  draftFromTemplate,
  draftFromTemplateKey,
  emptyDraft,
  expectedCount,
  stepIssues,
  summarise,
  toConfiguration,
  toDimensionKey,
  withDimension,
  withDimensionValues,
  withExercise,
  withMeasurementType,
  withMeasurementTypeMoved,
  withNotes,
  withoutDimension,
  withoutExercise,
  withoutMeasurementType,
  withPasses,
  withRecordsSide,
  withRole,
} from './draft';

/**
 * The builder's rules live here rather than in the component, which is what
 * makes them testable at all. Every test below is a rule the screen must not be
 * able to break.
 */

/** The catalogue the builder would have loaded, as a lookup. */
const ids: Record<string, string> = {
  lactate: 'mt_lactate',
  heart_rate: 'mt_hr',
  rpe: 'mt_rpe',
  pace: 'mt_pace',
  body_fat: 'mt_body_fat',
  weight: 'mt_weight',
  external_load: 'mt_load',
  repetitions: 'mt_reps',
  force: 'mt_force',
  muscle_activity: 'mt_emg',
};

const idForTypeKey = (key: string) => ids[key];
const names = {
  measurementType: (id: string) => id.replace('mt_', ''),
  exercise: (id: string) => id.replace('ex_', ''),
};

describe('an empty draft', () => {
  const draft = emptyDraft('strength');

  it('starts with nothing configured', () => {
    expect(draft.measurementTypes).toEqual([]);
    expect(draft.exerciseIds).toEqual([]);
    expect(draft.dimensions).toEqual([]);
  });

  it('starts single-pass and two-sided-off — the ordinary case', () => {
    expect(draft.passes).toBe(1);
    expect(draft.recordsSide).toBe(false);
  });

  it('is not yet a configuration', () => {
    expect(toConfiguration(draft)).toBeNull();
  });
});

describe('a template is a starting point, not a link', () => {
  it('carries the lactate template’s four quantities and its stages', () => {
    const draft = draftFromTemplateKey('lactate_step_test', 'lactate', idForTypeKey);

    expect(draft.measurementTypes.map((entry) => entry.measurementTypeId)).toEqual([
      'mt_lactate',
      'mt_hr',
      'mt_rpe',
      'mt_pace',
    ]);
    expect(draft.passes).toBe(4);
  });

  it('carries the body-fat template’s roles, including the recommended weight', () => {
    const draft = draftFromTemplateKey('body_fat_measurement', 'body_composition', idForTypeKey);

    expect(draft.measurementTypes).toEqual([
      { measurementTypeId: 'mt_body_fat', role: 'required' },
      { measurementTypeId: 'mt_weight', role: 'recommended' },
    ]);
  });

  it('carries the maximal strength template’s load and repetitions', () => {
    const draft = draftFromTemplateKey('max_strength_test', 'strength', idForTypeKey);

    expect(draft.measurementTypes.map((entry) => entry.measurementTypeId)).toEqual([
      'mt_load',
      'mt_reps',
    ]);
    expect(draft.recordsSide).toBe(false);
  });

  it('carries the muscle activity template’s open dimension and its sides', () => {
    const draft = draftFromTemplateKey('muscle_activity_measurement', 'movement', idForTypeKey);

    expect(draft.recordsSide).toBe(true);
    expect(draft.dimensions).toEqual([{ key: 'site', label: 'Measurement site' }]);
    expect(draft.dimensions[0]?.values).toBeUndefined();
  });

  /**
   * The whole point of copying rather than referencing: editing the draft, or
   * the template later, must not reach the other.
   */
  it('is independent of the template it came from', () => {
    const template = findMeasurementTemplate('lactate_step_test')!;
    const draft = withPasses(draftFromTemplate(template, idForTypeKey), 9);

    expect(draft.passes).toBe(9);
    expect(template.passes).toBe(4);
    expect(draftFromTemplate(template, idForTypeKey).passes).toBe(4);
  });

  it('never puts the template key into the configuration', () => {
    const draft = draftFromTemplateKey('lactate_step_test', 'lactate', idForTypeKey);
    const configuration = toConfiguration(draft);

    expect(draft.templateKey).toBe('lactate_step_test');
    expect(JSON.stringify(configuration)).not.toContain('lactate_step_test');
    expect(configuration).not.toHaveProperty('templateKey');
  });

  it('drops a quantity this workspace has no type for, rather than guessing', () => {
    const draft = draftFromTemplateKey('lactate_step_test', 'lactate', (key) =>
      key === 'rpe' ? undefined : ids[key],
    );

    expect(draft.measurementTypes.map((entry) => entry.measurementTypeId)).toEqual([
      'mt_lactate',
      'mt_hr',
      'mt_pace',
    ]);
  });

  it('falls back to an empty draft for an unknown template', () => {
    expect(draftFromTemplateKey('not_a_template', 'custom', idForTypeKey).measurementTypes).toEqual(
      [],
    );
  });
});

describe('choosing measurements and roles', () => {
  const base = emptyDraft('lactate');

  it('adds a quantity as required by default', () => {
    expect(withMeasurementType(base, 'mt_lactate').measurementTypes).toEqual([
      { measurementTypeId: 'mt_lactate', role: 'required' },
    ]);
  });

  it('does not add the same quantity twice', () => {
    const once = withMeasurementType(base, 'mt_lactate');

    expect(withMeasurementType(once, 'mt_lactate').measurementTypes).toHaveLength(1);
  });

  it('removes a quantity', () => {
    const draft = withMeasurementType(withMeasurementType(base, 'mt_lactate'), 'mt_hr');

    expect(withoutMeasurementType(draft, 'mt_lactate').measurementTypes).toEqual([
      { measurementTypeId: 'mt_hr', role: 'required' },
    ]);
  });

  it('changes a role without touching the others', () => {
    const draft = withMeasurementType(withMeasurementType(base, 'mt_lactate'), 'mt_hr');

    expect(withRole(draft, 'mt_hr', 'optional').measurementTypes).toEqual([
      { measurementTypeId: 'mt_lactate', role: 'required' },
      { measurementTypeId: 'mt_hr', role: 'optional' },
    ]);
  });

  it('accepts all three roles', () => {
    let draft = withMeasurementType(base, 'mt_lactate');
    for (const role of ['required', 'recommended', 'optional'] as const) {
      draft = withRole(draft, 'mt_lactate', role);
      expect(draft.measurementTypes[0]?.role).toBe(role);
    }
  });

  /** Order is configuration — the entry grid and the analysis follow it. */
  it('reorders a quantity', () => {
    const draft = withMeasurementType(withMeasurementType(base, 'mt_lactate'), 'mt_hr');

    expect(
      withMeasurementTypeMoved(draft, 'mt_hr', -1).measurementTypes.map(
        (entry) => entry.measurementTypeId,
      ),
    ).toEqual(['mt_hr', 'mt_lactate']);
  });

  it('refuses to move past either end', () => {
    const draft = withMeasurementType(base, 'mt_lactate');

    expect(withMeasurementTypeMoved(draft, 'mt_lactate', -1)).toBe(draft);
    expect(withMeasurementTypeMoved(draft, 'mt_lactate', 1)).toBe(draft);
  });
});

describe('passes', () => {
  const base = withMeasurementType(emptyDraft('lactate'), 'mt_lactate');

  it('takes a stage count', () => {
    expect(withPasses(base, 5).passes).toBe(5);
  });

  /**
   * A single-pass test is the ordinary case and stores `passes: 1`. What must
   * *not* happen is a measurement carrying a constant `passIndex: 1` — that is
   * enforced in `validatePassIndex`, and the configuration here simply says one.
   */
  it('keeps one as the ordinary single-pass case', () => {
    expect(toConfiguration(withPasses(base, 1))?.passes).toBe(1);
  });

  it('clamps below one and above the schema’s ceiling, so the form cannot fail on save', () => {
    expect(withPasses(base, 0).passes).toBe(1);
    expect(withPasses(base, -4).passes).toBe(1);
    expect(withPasses(base, 999).passes).toBe(50);
    expect(toConfiguration(withPasses(base, 999))).not.toBeNull();
  });

  it('rounds a fractional stage count', () => {
    expect(withPasses(base, 3.7).passes).toBe(4);
  });
});

describe('sides and dimensions', () => {
  const base = withMeasurementType(emptyDraft('mobility'), 'mt_rom');

  it('turns per-side recording on and off', () => {
    expect(withRecordsSide(base, true).recordsSide).toBe(true);
    expect(withRecordsSide(withRecordsSide(base, true), false).recordsSide).toBe(false);
  });

  it('adds and removes a dimension', () => {
    const draft = withDimension(base, { key: 'joint', label: 'Joint' });

    expect(draft.dimensions).toEqual([{ key: 'joint', label: 'Joint' }]);
    expect(withoutDimension(draft, 'joint').dimensions).toEqual([]);
  });

  it('does not add the same dimension key twice', () => {
    const once = withDimension(base, { key: 'joint', label: 'Joint' });

    expect(withDimension(once, { key: 'joint', label: 'Other' }).dimensions).toHaveLength(1);
  });

  /**
   * An empty value list means an **open** dimension — the coach names the sites
   * as they go. Declaring values is always their decision; the shipped templates
   * declare none, because naming anatomy is a professional call.
   */
  it('leaves a dimension open when no values are given', () => {
    const draft = withDimensionValues(
      withDimension(base, { key: 'site', label: 'Site' }),
      'site',
      [],
    );

    expect(draft.dimensions[0]).not.toHaveProperty('values');
  });

  it('closes a dimension when values are given, ignoring blanks', () => {
    const draft = withDimensionValues(
      withDimension(base, { key: 'joint', label: 'Joint' }),
      'joint',
      ['knee', '  ', 'hip '],
    );

    expect(draft.dimensions[0]?.values).toEqual(['knee', 'hip']);
  });

  it('turns a label into a key the schema accepts', () => {
    expect(toDimensionKey('Measurement site')).toBe('measurement_site');
    expect(toDimensionKey('Joint / region')).toBe('joint_region');
    expect(
      moduleConfigurationSchema.safeParse({
        measurementTypes: [{ measurementTypeId: 'mt_1' }],
        dimensions: [{ key: toDimensionKey('Joint / region'), label: 'Joint / region' }],
      }).success,
    ).toBe(true);
  });
});

describe('exercises', () => {
  const base = withMeasurementType(emptyDraft('strength'), 'mt_load');

  it('adds and removes an exercise', () => {
    const draft = withExercise(base, 'ex_bench');

    expect(draft.exerciseIds).toEqual(['ex_bench']);
    expect(withoutExercise(draft, 'ex_bench').exerciseIds).toEqual([]);
  });

  it('does not add the same exercise twice', () => {
    expect(withExercise(withExercise(base, 'ex_bench'), 'ex_bench').exerciseIds).toHaveLength(1);
  });

  it('covers several exercises in one test', () => {
    const draft = withExercise(withExercise(base, 'ex_bench'), 'ex_deadlift');

    expect(toConfiguration(draft)?.exerciseIds).toEqual(['ex_bench', 'ex_deadlift']);
  });

  it('stores an empty list when the test names no movement', () => {
    expect(toConfiguration(base)?.exerciseIds).toEqual([]);
  });
});

describe('turning a draft into a configuration', () => {
  it('refuses a draft with no measurement', () => {
    expect(toConfiguration(emptyDraft('lactate'))).toBeNull();
  });

  it('produces exactly the stored contract, and nothing beside it', () => {
    const draft = withNotes(
      withPasses(withMeasurementType(emptyDraft('lactate'), 'mt_lactate'), 4),
      '  4 minutes per stage  ',
    );

    const configuration = toConfiguration(draft);

    expect(Object.keys(configuration ?? {}).sort()).toEqual([
      'dimensions',
      'exerciseIds',
      'measurementTypes',
      'notes',
      'passes',
      'recordsSide',
    ]);
    expect(configuration?.notes).toBe('4 minutes per stage');
  });

  it('omits empty protocol notes rather than storing a blank string', () => {
    const draft = withNotes(withMeasurementType(emptyDraft('lactate'), 'mt_lactate'), '   ');

    expect(toConfiguration(draft)).not.toHaveProperty('notes');
  });

  it('round-trips a stored configuration back into a draft', () => {
    const original = withExercise(
      withRecordsSide(
        withPasses(
          withRole(
            withMeasurementType(withMeasurementType(emptyDraft('strength'), 'mt_load'), 'mt_reps'),
            'mt_reps',
            'recommended',
          ),
          3,
        ),
        true,
      ),
      'ex_bench',
    );

    const configuration = toConfiguration(original)!;
    const reopened = draftFromConfiguration('strength', configuration);

    expect(toConfiguration(reopened)).toEqual(configuration);
  });
});

describe('steps', () => {
  it('runs test → measurements → protocol → summary', () => {
    expect(BUILDER_STEPS).toEqual(['test', 'measurements', 'protocol', 'summary']);
  });

  it('holds the coach on the measurements step until one is chosen, and says why', () => {
    const empty = emptyDraft('lactate');

    expect(canLeaveStep(empty, 'measurements')).toBe(false);
    expect(stepIssues(empty, 'measurements')[0]).toContain('at least one measurement');
  });

  it('lets the coach leave once a measurement is chosen', () => {
    const draft = withMeasurementType(emptyDraft('lactate'), 'mt_lactate');

    expect(canLeaveStep(draft, 'measurements')).toBe(true);
    expect(canLeaveStep(draft, 'summary')).toBe(true);
  });

  it('never blocks the first step — choosing a test is always possible', () => {
    expect(canLeaveStep(emptyDraft('custom'), 'test')).toBe(true);
  });
});

describe('the summary', () => {
  const draft = draftFromTemplateKey('lactate_step_test', 'lactate', idForTypeKey);
  const lines = summarise(draft, names);
  const line = (label: string) => lines.find((entry) => entry.label === label);

  it('names the test, not the module key', () => {
    expect(line('Test')?.value).toBe('Laktat');
  });

  it('lists every quantity with its role', () => {
    expect(line('Messgrößen')?.entries).toEqual([
      { name: 'lactate', role: 'required' },
      { name: 'hr', role: 'required' },
      { name: 'rpe', role: 'required' },
      { name: 'pace', role: 'required' },
    ]);
  });

  it('shows the stage count', () => {
    expect(line('Stufen')?.value).toBe('4');
  });

  /** "Single pass" rather than "1" — a one-pass test is not a stepped test. */
  it('says single pass instead of one', () => {
    const single = withPasses(draft, 1);

    expect(summarise(single, names).find((entry) => entry.label === 'Stufen')?.value).toBe(
      'Einfache Erfassung',
    );
  });

  it('reports no sides and no exercises for a lactate test', () => {
    expect(line('Seiten')?.value).toBe('Nein');
    expect(line('Übungen')?.value).toBe('Keine');
  });

  it('names the exercises a strength test covers', () => {
    const strength = withExercise(
      withExercise(draftFromTemplateKey('max_strength_test', 'strength', idForTypeKey), 'ex_bench'),
      'ex_deadlift',
    );

    expect(summarise(strength, names).find((entry) => entry.label === 'Übungen')?.value).toBe(
      'bench · deadlift',
    );
  });

  it('marks an open dimension as free rather than pretending to know its values', () => {
    const movement = draftFromTemplateKey('muscle_activity_measurement', 'movement', idForTypeKey);

    expect(summarise(movement, names).find((entry) => entry.label === 'Merkmale')?.value).toBe(
      'Measurement site (frei)',
    );
  });

  it('shows no ids anywhere', () => {
    const rendered = JSON.stringify(lines);

    expect(rendered).not.toContain('mt_');
  });
});

describe('the expected measurement count shown before saving', () => {
  it('multiplies quantities by stages', () => {
    expect(expectedCount(draftFromTemplateKey('lactate_step_test', 'lactate', idForTypeKey))).toBe(
      16,
    );
  });

  it('multiplies by exercises and leaves optional quantities out', () => {
    const draft = withRole(
      withExercise(
        withExercise(draftFromTemplateKey('max_strength_test', 'strength', idForTypeKey), 'ex_a'),
        'ex_b',
      ),
      'mt_reps',
      'optional',
    );

    // One counted quantity (load) × 2 exercises.
    expect(expectedCount(draft)).toBe(2);
  });

  it('is zero while the draft is not a configuration yet', () => {
    expect(expectedCount(emptyDraft('lactate'))).toBe(0);
  });
});
