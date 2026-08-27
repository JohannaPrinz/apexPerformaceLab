import { describe, expect, it } from 'vitest';

import { moduleConfigurationSchema, type ModuleConfiguration } from '../modules/configuration';

import { analyseMovement, type MovementResult } from './engine';
import { squatVideo } from './figure.test-helper';
import {
  angleValueId,
  JOINT_DIMENSION_KEY,
  movementValues,
  NO_DECISIONS,
  planMeasurements,
  POSITION_DIMENSION_KEY,
  rangeValueId,
  storableOf,
  type PlanDecisions,
} from './plan';
import { SQUAT_PROFILE } from './profile';

/**
 * Matching a measurement to the model that already exists.
 *
 * The tests worth having are all about what is **not** written: a quantity the
 * catalogue does not hold, a quantity this test does not record, a knee angle
 * and a hip angle that would land in the same slot, an angle whose position
 * nothing records. Every one of those, written anyway, produces a number in an
 * athlete's record that means something other than what it says — and unlike a
 * crash, nobody would notice.
 */

const TYPE_REPS = 'type-repetitions';
const TYPE_ROM = 'type-range-of-motion';
const TYPE_ANGLE = 'type-joint-angle';
const TYPE_LOAD = 'type-external-load';

const TYPE_KEYS = {
  [TYPE_REPS]: 'repetitions',
  [TYPE_ROM]: 'range_of_motion',
  [TYPE_ANGLE]: 'joint_angle',
  [TYPE_LOAD]: 'external_load',
};

const ALL = SQUAT_PROFILE.tracks.map((track) => track.key);

/** A real measurement rather than a hand-written fixture. */
function measure(tracks: readonly string[] = ALL): MovementResult {
  const outcome = analyseMovement(squatVideo(3), SQUAT_PROFILE, tracks);
  if (!outcome.ok) throw new Error('the fixture video should analyse');

  return outcome.result;
}

const RESULT = measure();
const VALUES = movementValues(RESULT, SQUAT_PROFILE);

/** The shape the automatically created video-analysis test carries. */
const withAngles = (overrides: Record<string, unknown> = {}): ModuleConfiguration =>
  moduleConfigurationSchema.parse({
    measurementTypes: [{ measurementTypeId: TYPE_ANGLE }],
    recordsSide: true,
    dimensions: [
      { key: JOINT_DIMENSION_KEY, label: 'Gelenk' },
      { key: POSITION_DIMENSION_KEY, label: 'Position' },
    ],
    ...overrides,
  });

/** A test with no axes at all — what a coach configures by hand. */
const plain = (overrides: Record<string, unknown> = {}): ModuleConfiguration =>
  moduleConfigurationSchema.parse({
    measurementTypes: [{ measurementTypeId: TYPE_REPS }, { measurementTypeId: TYPE_ROM }],
    recordsSide: true,
    dimensions: [],
    ...overrides,
  });

const decide = (overrides: Partial<PlanDecisions> = {}): PlanDecisions => ({
  ...NO_DECISIONS,
  ...overrides,
});

describe('the values a measurement produces', () => {
  it('names an angle per track, side and position', () => {
    const ids = VALUES.map((value) => value.id);

    expect(ids).toContain(angleValueId('knee', 'left', 'flexed'));
    expect(ids).toContain(angleValueId('knee', 'left', 'extended'));
    expect(ids).toContain(angleValueId('ankle', 'right', 'flexed'));
  });

  it('names a range per track and side', () => {
    expect(VALUES.map((value) => value.id)).toContain(rangeValueId('hip', 'left'));
  });

  it('names the count, the duration and the tempo', () => {
    const ids = VALUES.map((value) => value.id);

    expect(ids).toContain('repetitions');
    expect(ids).toContain('rep_duration_mean');
    expect(ids).toContain('tempo');
  });

  it('produces nothing for a track the coach deselected', () => {
    const ids = movementValues(measure(['knee']), SQUAT_PROFILE).map((value) => value.id);

    expect(ids).toContain(angleValueId('knee', 'left', 'flexed'));
    expect(ids).not.toContain(angleValueId('hip', 'left', 'flexed'));
    expect(ids).not.toContain(rangeValueId('hip', 'left'));
  });

  it('labels each value in the profile own words', () => {
    const flexed = VALUES.find((value) => value.id === angleValueId('knee', 'left', 'flexed'));

    expect(flexed?.label).toBe('Knie — gebeugt links');
    expect(flexed?.unit).toBe('°');
  });

  it('omits the count entirely for a profile that counts nothing', () => {
    const held = { ...SQUAT_PROFILE, counting: { kind: 'none' } as const };
    const outcome = analyseMovement(squatVideo(3), held, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const ids = movementValues(outcome.result, held).map((value) => value.id);

    expect(ids).not.toContain('repetitions');
    expect(ids).not.toContain('tempo');
  });
});

describe('what gets written', () => {
  it('stores an angle with both axes filled', () => {
    const entries = planMeasurements(VALUES, withAngles(), TYPE_KEYS);
    const flexed = entries.find(
      (entry) => entry.value.id === angleValueId('knee', 'left', 'flexed'),
    );

    expect(flexed?.kind).toBe('storable');
    if (flexed?.kind !== 'storable') return;

    expect(flexed.write.measurementTypeId).toBe(TYPE_ANGLE);
    expect(flexed.write.context).toEqual({ joint: 'knee', position: 'gebeugt' });
    expect(flexed.write.side).toBe('LEFT');
  });

  it('gives every angle of one side its own coordinates', () => {
    // Without that they are one series, and every later comparison averages a
    // knee at the bottom with a hip at the top.
    const written = storableOf(planMeasurements(VALUES, withAngles(), TYPE_KEYS));
    const contexts = written
      .filter((entry) => entry.side === 'LEFT')
      .map((entry) => JSON.stringify(entry.context));

    expect(contexts.length).toBeGreaterThan(1);
    expect(new Set(contexts).size).toBe(contexts.length);
  });

  it('stores nothing for a track the coach deselected', () => {
    const kneeOnly = movementValues(measure(['knee']), SQUAT_PROFILE);
    const written = storableOf(planMeasurements(kneeOnly, withAngles(), TYPE_KEYS));

    expect(written.length).toBeGreaterThan(0);
    for (const entry of written) {
      expect(entry.context?.['joint']).toBe('knee');
    }
  });

  it('keeps the range a separate quantity from the angle', () => {
    const config = plain({
      measurementTypes: [{ measurementTypeId: TYPE_ROM }],
      dimensions: [{ key: JOINT_DIMENSION_KEY, label: 'Gelenk' }],
    });

    const written = storableOf(planMeasurements(VALUES, config, TYPE_KEYS));

    expect(written.length).toBeGreaterThan(0);
    for (const entry of written) expect(entry.measurementTypeId).toBe(TYPE_ROM);
  });

  it('carries the value the coach edited, not the one measured', () => {
    const id = angleValueId('knee', 'left', 'flexed');
    const entries = planMeasurements(
      VALUES,
      withAngles(),
      TYPE_KEYS,
      decide({ edited: { [id]: 64 } }),
    );

    const flexed = entries.find((entry) => entry.value.id === id);

    expect(flexed?.kind === 'storable' && flexed.write.value).toBe(64);
  });

  it('leaves out what the coach unticked', () => {
    const id = angleValueId('knee', 'left', 'flexed');
    const entries = planMeasurements(VALUES, withAngles(), TYPE_KEYS, decide({ excluded: [id] }));

    expect(entries.find((entry) => entry.value.id === id)?.kind).toBe('excluded');
  });

  it('attaches the remark to every value it writes', () => {
    const written = storableOf(
      planMeasurements(VALUES, withAngles(), TYPE_KEYS, NO_DECISIONS, 'Aus Videoanalyse.'),
    );

    expect(written.length).toBeGreaterThan(0);
    for (const entry of written) expect(entry.note).toBe('Aus Videoanalyse.');
  });
});

describe('what it refuses to write', () => {
  it('refuses a quantity the catalogue does not hold', () => {
    const entries = planMeasurements(VALUES, withAngles(), TYPE_KEYS);

    for (const id of ['rep_duration_mean', 'tempo']) {
      const entry = entries.find((candidate) => candidate.value.id === id);

      expect(entry?.kind === 'refused' && entry.refusal).toBe('NO_CATALOGUE_TYPE');
    }
  });

  it('refuses a quantity this test does not record', () => {
    const unrelated = plain({ measurementTypes: [{ measurementTypeId: TYPE_LOAD }] });
    const entry = planMeasurements(VALUES, unrelated, TYPE_KEYS).find(
      (candidate) => candidate.value.id === rangeValueId('knee', 'left'),
    );

    expect(entry?.kind === 'refused' && entry.refusal).toBe('TYPE_NOT_CONFIGURED');
  });

  it('refuses an angle in a test with no position axis', () => {
    const jointOnly = plain({
      measurementTypes: [{ measurementTypeId: TYPE_ANGLE }],
      dimensions: [{ key: JOINT_DIMENSION_KEY, label: 'Gelenk' }],
    });

    const entry = planMeasurements(VALUES, jointOnly, TYPE_KEYS).find(
      (candidate) => candidate.value.id === angleValueId('knee', 'left', 'flexed'),
    );

    expect(entry?.kind === 'refused' && entry.refusal).toBe('POSITION_NOT_DISTINGUISHABLE');
  });

  it('refuses a range in a test that demands a position', () => {
    // A range spans both ends, so it has no honest value for that axis.
    const entry = planMeasurements(
      VALUES,
      withAngles({
        measurementTypes: [{ measurementTypeId: TYPE_ROM }, { measurementTypeId: TYPE_ANGLE }],
      }),
      TYPE_KEYS,
    ).find((candidate) => candidate.value.id === rangeValueId('knee', 'left'));

    expect(entry?.kind === 'refused' && entry.refusal).toBe('DIMENSION_UNFILLABLE');
  });

  it('refuses several tracks where nothing tells them apart', () => {
    const entry = planMeasurements(VALUES, plain(), TYPE_KEYS).find(
      (candidate) => candidate.value.id === rangeValueId('knee', 'left'),
    );

    expect(entry?.kind === 'refused' && entry.refusal).toBe('JOINT_NOT_DISTINGUISHABLE');
  });

  it('accepts a single track without an axis', () => {
    const kneeOnly = movementValues(measure(['knee']), SQUAT_PROFILE);
    const entry = planMeasurements(kneeOnly, plain(), TYPE_KEYS).find(
      (candidate) => candidate.value.id === rangeValueId('knee', 'left'),
    );

    expect(entry?.kind).toBe('storable');
    expect(entry?.kind === 'storable' && entry.write.context).toBeNull();
  });

  it('refuses a side in a test that records none', () => {
    const kneeOnly = movementValues(measure(['knee']), SQUAT_PROFILE);
    const entry = planMeasurements(kneeOnly, plain({ recordsSide: false }), TYPE_KEYS).find(
      (candidate) => candidate.value.id === rangeValueId('knee', 'left'),
    );

    expect(entry?.kind === 'refused' && entry.refusal).toBe('SIDE_NOT_RECORDED');
  });

  it('refuses a repetition count in a test that demands a joint', () => {
    // A count is not a reading of one joint, and there is no honest value for
    // the axis. A real limit of the context model, recorded so it cannot later
    // be "fixed" by inventing one.
    // The count *is* configured here, so the refusal can only come from the
    // axis — otherwise the earlier type check would answer first.
    const counting = withAngles({
      measurementTypes: [{ measurementTypeId: TYPE_ANGLE }, { measurementTypeId: TYPE_REPS }],
    });

    const entry = planMeasurements(VALUES, counting, TYPE_KEYS).find(
      (candidate) => candidate.value.id === 'repetitions',
    );

    expect(entry?.kind === 'refused' && entry.refusal).toBe('DIMENSION_UNFILLABLE');
  });

  it('refuses everything until an exercise and a stage are chosen', () => {
    const demanding = withAngles({ exerciseIds: ['exercise-squat'], passes: 4 });

    expect(storableOf(planMeasurements(VALUES, demanding, TYPE_KEYS))).toEqual([]);

    const written = storableOf(
      planMeasurements(
        VALUES,
        demanding,
        TYPE_KEYS,
        decide({ exerciseId: 'exercise-squat', passIndex: 2 }),
      ),
    );

    expect(written.length).toBeGreaterThan(0);
    for (const entry of written) {
      expect(entry.exerciseId).toBe('exercise-squat');
      expect(entry.passIndex).toBe(2);
    }
  });

  it('refuses an axis the analysis knows nothing about, until it is filled', () => {
    const positional = withAngles({
      dimensions: [
        { key: JOINT_DIMENSION_KEY, label: 'Gelenk' },
        { key: POSITION_DIMENSION_KEY, label: 'Position' },
        { key: 'untergrund', label: 'Untergrund' },
      ],
    });

    const refused = planMeasurements(VALUES, positional, TYPE_KEYS).find(
      (candidate) => candidate.value.id === angleValueId('knee', 'left', 'flexed'),
    );

    expect(refused?.kind === 'refused' && refused.refusal).toBe('DIMENSION_UNFILLABLE');

    const filled = planMeasurements(
      VALUES,
      positional,
      TYPE_KEYS,
      decide({ dimensionValues: { untergrund: 'Hallenboden' } }),
    ).find((candidate) => candidate.value.id === angleValueId('knee', 'left', 'flexed'));

    expect(filled?.kind).toBe('storable');
  });
});

describe('naming the axes', () => {
  it('recognises the German joint label a coach actually types', () => {
    // The builder derives the key from the label, and the interface is German.
    const german = withAngles({
      dimensions: [
        { key: 'gelenk', label: 'Gelenk' },
        { key: POSITION_DIMENSION_KEY, label: 'Position' },
      ],
    });

    const entry = planMeasurements(VALUES, german, TYPE_KEYS).find(
      (candidate) => candidate.value.id === angleValueId('knee', 'left', 'flexed'),
    );

    expect(entry?.kind === 'storable' && entry.write.context).toEqual({
      gelenk: 'knee',
      position: 'gebeugt',
    });
  });

  it('does not match an axis that merely mentions a joint', () => {
    const other = withAngles({
      dimensions: [
        { key: 'gelenkstellung', label: 'Gelenkstellung' },
        { key: POSITION_DIMENSION_KEY, label: 'Position' },
      ],
    });

    const entry = planMeasurements(VALUES, other, TYPE_KEYS).find(
      (candidate) => candidate.value.id === angleValueId('knee', 'left', 'flexed'),
    );

    expect(entry?.kind === 'refused' && entry.refusal).toBe('DIMENSION_UNFILLABLE');
  });

  it('lets the coach map onto a closed list', () => {
    const closed = withAngles({
      dimensions: [
        { key: JOINT_DIMENSION_KEY, label: 'Gelenk', values: ['Knie', 'Hüfte', 'Sprunggelenk'] },
        { key: POSITION_DIMENSION_KEY, label: 'Position', values: ['Start', 'Endposition'] },
      ],
    });

    const entry = planMeasurements(
      VALUES,
      closed,
      TYPE_KEYS,
      decide({
        trackValues: { knee: 'Knie' },
        positionValues: { flexed: 'Endposition', extended: 'Start' },
      }),
    ).find((candidate) => candidate.value.id === angleValueId('knee', 'left', 'flexed'));

    expect(entry?.kind === 'storable' && entry.write.context).toEqual({
      joint: 'Knie',
      position: 'Endposition',
    });
  });

  it('refuses a closed list nothing was chosen from', () => {
    const closed = withAngles({
      dimensions: [
        { key: JOINT_DIMENSION_KEY, label: 'Gelenk', values: ['Knie'] },
        { key: POSITION_DIMENSION_KEY, label: 'Position' },
      ],
    });

    const entry = planMeasurements(VALUES, closed, TYPE_KEYS).find(
      (candidate) => candidate.value.id === angleValueId('knee', 'left', 'flexed'),
    );

    expect(entry?.kind === 'refused' && entry.refusal).toBe('JOINT_VALUE_MISSING');
  });
});

describe('the type lookup', () => {
  it('ignores a type the workspace has but this test does not use', () => {
    const withStray = { ...TYPE_KEYS, 'type-other-angle': 'joint_angle' };
    const entry = planMeasurements(VALUES, withAngles(), withStray).find(
      (candidate) => candidate.value.id === angleValueId('knee', 'left', 'flexed'),
    );

    expect(entry?.kind === 'storable' && entry.write.measurementTypeId).toBe(TYPE_ANGLE);
  });
});
