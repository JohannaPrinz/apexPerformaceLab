import { describe, expect, it } from 'vitest';

import { findMeasurementTemplate, moduleConfigurationSchema } from '@apex/domain';

import {
  BUILDER_STEPS,
  canLeaveStep,
  EMPTY_PROTOCOL,
  draftFromConfiguration,
  draftFromTemplate,
  draftFromTemplateKey,
  emptyDraft,
  expectedCount,
  stepIssues,
  summarise,
  toConfiguration,
  toDimensionKey,
  toProtocolKey,
  withDimension,
  withDimensionValues,
  withExercise,
  withMeasurementType,
  withMeasurementTypeMoved,
  withNotes,
  withLoadMeasurementType,
  withProtocol,
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
  speed: 'mt_speed',
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
    expect(stepIssues(empty, 'measurements')[0]).toContain('mindestens eine Messgröße');
  });

  it('lets the coach leave once a measurement is chosen', () => {
    const draft = withMeasurementType(emptyDraft('lactate'), 'mt_lactate');

    expect(canLeaveStep(draft, 'measurements')).toBe(true);
    expect(canLeaveStep(draft, 'summary')).toBe(true);
  });

  it('holds the coach on the first step until the test has a name', () => {
    // The name is what tells two tests of one type apart, so it is the one
    // thing the first step cannot be left without.
    expect(canLeaveStep(emptyDraft('custom'), 'test')).toBe(false);
    expect(canLeaveStep({ ...emptyDraft('custom'), name: 'Laufen – Sprint' }, 'test')).toBe(true);
  });
});

describe('the summary', () => {
  const draft = draftFromTemplateKey('lactate_step_test', 'lactate', idForTypeKey);
  const lines = summarise(draft, names);
  const line = (label: string) => lines.find((entry) => entry.label === label);

  it('names the test and its type separately', () => {
    // Two lines now: what the coach called it, and what kind of test it is.
    // A template proposes the name, which is why it reads as the template does.
    expect(line('Testtyp')?.value).toBe('Laktat');
    expect(line('Name')?.value).toBe('Lactate step test');
  });

  it('lists every quantity with its role', () => {
    // RPE is recommended in the lactate template: a self-report on a scale
    // that is routinely not taken must not hold a usable test at "partially
    // evaluable" for ever.
    expect(line('Messgrößen')?.entries).toEqual([
      { name: 'lactate', role: 'required' },
      { name: 'hr', role: 'required' },
      { name: 'rpe', role: 'recommended' },
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

/**
 * Which quantity states what a stage demanded.
 *
 * A treadmill step test is set in either pace or speed. Which of the two a
 * coach works in is theirs to say, so it is a choice on the draft — never a
 * rule inferred from the quantity list.
 */
describe('the load quantity', () => {
  const stepTest = () => draftFromTemplateKey('lactate_step_test', 'lactate', idForTypeKey);

  it('starts on what the template proposes', () => {
    expect(stepTest().loadMeasurementTypeId).toBe('mt_pace');
  });

  it('stays empty where the template proposes none', () => {
    expect(
      draftFromTemplateKey('max_strength_test', 'strength', idForTypeKey).loadMeasurementTypeId,
    ).toBeNull();
  });

  it('stays empty where the workspace has no such type', () => {
    // A template names quantities by key; a workspace missing that type gets a
    // shorter list, and the load must not survive as a reference to nothing.
    const draft = draftFromTemplateKey('lactate_step_test', 'lactate', (key) =>
      key === 'pace' ? undefined : ids[key],
    );

    expect(draft.loadMeasurementTypeId).toBeNull();
  });

  it('can be swapped from pace to speed', () => {
    // The case the coach asked for: the same test, set in km/h instead.
    const swapped = withLoadMeasurementType(
      withMeasurementType(withoutMeasurementType(stepTest(), 'mt_pace'), 'mt_speed'),
      'mt_speed',
    );

    expect(swapped.loadMeasurementTypeId).toBe('mt_speed');
    expect(toConfiguration(swapped)?.loadMeasurementTypeId).toBe('mt_speed');
  });

  it('is cleared when the quantity it names is removed', () => {
    expect(withoutMeasurementType(stepTest(), 'mt_pace').loadMeasurementTypeId).toBeNull();
  });

  it('leaves the load alone when a different quantity is removed', () => {
    expect(withoutMeasurementType(stepTest(), 'mt_rpe').loadMeasurementTypeId).toBe('mt_pace');
  });

  it('refuses a quantity the test does not record', () => {
    // An axis needs a value on every stage; naming one the test never takes
    // would put an empty diagram on the screen.
    const draft = stepTest();

    expect(withLoadMeasurementType(draft, 'mt_force')).toBe(draft);
  });

  it('can be given up', () => {
    expect(withLoadMeasurementType(stepTest(), null).loadMeasurementTypeId).toBeNull();
  });

  it('survives being reopened for editing', () => {
    const configuration = toConfiguration(stepTest());
    expect(configuration).not.toBeNull();

    expect(draftFromConfiguration('lactate', configuration!).loadMeasurementTypeId).toBe('mt_pace');
  });

  it('is left out of the configuration entirely where there is none', () => {
    const configuration = toConfiguration(withLoadMeasurementType(stepTest(), null));

    expect(configuration?.loadMeasurementTypeId).toBeUndefined();
  });

  it('names it in the summary of a stepped test', () => {
    const lines = summarise(stepTest(), names);

    expect(lines.find((line) => line.label === 'Belastungsgröße')?.value).toBe('pace');
  });

  it('says so plainly when a stepped test names none', () => {
    const lines = summarise(withLoadMeasurementType(stepTest(), null), names);

    expect(lines.find((line) => line.label === 'Belastungsgröße')?.value).toBe('Keine');
  });

  it('leaves the line off a single erfassung', () => {
    // A body-fat measurement has no stages to compare, so it has no demand axis.
    const lines = summarise(
      draftFromTemplateKey('body_fat_measurement', 'body_composition', idForTypeKey),
      names,
    );

    expect(lines.some((line) => line.label === 'Belastungsgröße')).toBe(false);
  });
});

/**
 * The structured protocol through the builder.
 *
 * What has to hold: a test that declares nothing is stored exactly as it was
 * before this existed, and a test that declares something survives being
 * reopened without drifting.
 */
describe('the test protocol', () => {
  const withMeasurement = () => withMeasurementType(emptyDraft('strength'), 'mt_1');

  it('is absent from the configuration until it has a name', () => {
    const draft = withProtocol(withMeasurement(), {
      ...EMPTY_PROTOCOL,
      distanceM: '1000',
      device: 'skierg',
    });

    // A distance without a name for the setup names nothing that can be
    // compared, so the whole block is dropped rather than half-stored.
    expect(toConfiguration(draft)?.protocol).toBeUndefined();
  });

  it('stores only the fields the coach filled in', () => {
    const draft = withProtocol(withMeasurement(), {
      ...EMPTY_PROTOCOL,
      key: 'erg_1000m_ski',
      device: 'skierg',
    });

    const protocol = toConfiguration(draft)?.protocol;

    // An empty string would be a declared condition that says nothing, and two
    // tests would then differ by a blank.
    expect(protocol).toEqual({ key: 'erg_1000m_ski', device: 'skierg' });
  });

  it('reads a decimal distance the way a German keyboard produces one', () => {
    const draft = withProtocol(withMeasurement(), {
      ...EMPTY_PROTOCOL,
      key: 'sprint',
      distanceM: '402,3',
    });

    expect(toConfiguration(draft)?.protocol?.distanceM).toBeCloseTo(402.3, 5);
  });

  it('drops a distance that is not one rather than losing the configuration', () => {
    const draft = withProtocol(withMeasurement(), {
      ...EMPTY_PROTOCOL,
      key: 'run',
      distanceM: 'ungefähr weit',
    });

    const configuration = toConfiguration(draft);

    expect(configuration).not.toBeNull();
    expect(configuration?.protocol).toEqual({ key: 'run' });
  });

  it('survives a round trip through a stored configuration', () => {
    const draft = withProtocol(withMeasurement(), {
      key: 'run_1km_bahn',
      label: '1 km Bahn',
      distanceM: '1000',
      division: 'open',
      device: '',
      venue: 'halle_a',
      betterDirection: 'lower',
    });

    const stored = toConfiguration(draft);
    expect(stored).not.toBeNull();

    const reopened = draftFromConfiguration('strength', stored!);

    expect(reopened.protocol).toEqual({
      key: 'run_1km_bahn',
      label: '1 km Bahn',
      distanceM: '1000',
      division: 'open',
      device: '',
      venue: 'halle_a',
      betterDirection: 'lower',
    });
  });

  it('slugs a label the way a dimension key is slugged', () => {
    expect(toProtocolKey('1 km Bahn, frisch')).toBe('1_km_bahn_frisch');
    expect(toProtocolKey('1km bahn frisch')).toBe('1km_bahn_frisch');
  });

  it('leaves a template without one', () => {
    // A template proposes how a test is measured; under which conditions it is
    // run is this coach's decision and never a shipped default.
    expect(draftFromTemplateKey('lactate_step_test', 'lactate', () => 'mt_1').protocol).toEqual(
      EMPTY_PROTOCOL,
    );
  });
});

/**
 * The standardised time trials.
 *
 * A template that names a movement and its conditions has to arrive in the
 * draft as a *complete* test — otherwise the coach is asked to reconstruct the
 * standard by hand, which is what the template exists to prevent.
 */
describe('the standardised templates', () => {
  const ids: Record<string, string> = { duration: 'mt_duration' };
  const exerciseIds: Record<string, string> = { row_erg: 'ex_row', ski_erg: 'ex_ski' };

  const seed = (key: string) =>
    draftFromTemplateKey(
      key,
      'running',
      (k) => ids[k],
      (k) => exerciseIds[k],
    );

  it('arrives with the movement, the distance and the direction filled in', () => {
    const draft = seed('row_1000m');

    expect(draft.exerciseIds).toEqual(['ex_row']);
    expect(draft.protocol.label).toBe('1000 m Rudern');
    expect(draft.protocol.distanceM).toBe('1000');
    expect(draft.protocol.betterDirection).toBe('lower');
    expect(toConfiguration(draft)?.protocol?.distanceM).toBe(1000);
  });

  it('gives the rower and the ski ergometer separate identities', () => {
    expect(toConfiguration(seed('row_1000m'))?.protocol?.key).not.toBe(
      toConfiguration(seed('ski_1000m'))?.protocol?.key,
    );
  });

  it('separates the fresh kilometre from the compromised one', () => {
    expect(toConfiguration(seed('run_1km_fresh'))?.protocol?.key).not.toBe(
      toConfiguration(seed('run_1km_compromised'))?.protocol?.key,
    );
  });

  it('names no movement for the runs', () => {
    // Running is not a catalogue movement, and inventing one to fill this in
    // would put a row in the exercise catalogue nobody asked for.
    expect(seed('run_1km_fresh').exerciseIds).toEqual([]);
  });

  it('drops a movement the workspace does not hold rather than referring to nothing', () => {
    const draft = draftFromTemplateKey(
      'row_1000m',
      'running',
      (k) => ids[k],
      () => undefined,
    );

    expect(draft.exerciseIds).toEqual([]);
    // The rest of the template still arrives — a missing exercise costs the
    // exercise, not the test.
    expect(draft.protocol.distanceM).toBe('1000');
  });

  it('leaves the older templates exactly as they were', () => {
    const lactate = draftFromTemplateKey('lactate_step_test', 'lactate', () => 'mt_1');

    expect(lactate.exerciseIds).toEqual([]);
    expect(lactate.protocol).toEqual(EMPTY_PROTOCOL);
  });
});
