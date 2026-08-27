import { describe, expect, it, vi } from 'vitest';

import {
  analyseMovement,
  JOINT_DIMENSION_KEY,
  moduleConfigurationSchema,
  movementValues,
  planMeasurements,
  POSITION_DIMENSION_KEY,
  SQUAT_PROFILE,
  storableOf,
  type MovementResult,
  type PoseFrame,
} from '@apex/domain';

import { recordMeasurements } from './service';

/**
 * Writing what a video analysis computed.
 *
 * ## Against the real service
 *
 * The procedure is not mocked. The guarantees under test — the workspace on
 * every row, `DERIVED` on every row, a foreign module writing nothing — live in
 * `recordMeasurements`, and a test that stubbed it would prove only that the
 * stub was called. `db` is a fake because the assertions are about the *calls*,
 * which is where a tenant leak would show.
 *
 * ## Why this test lives beside the service and not beside the analysis
 *
 * It is the seam: the domain decides what to write, this service decides whether
 * it may be written, and nobody owns the join. It sits here because
 * `server/service.ts` is private to this slice — a test in the movement slice
 * would have had to import an internal, which is exactly the coupling the import
 * rule exists to prevent. The domain half is imported through its package, as
 * any caller would.
 */

const TENANT = { organizationId: 'org_a' };
const OTHER_TENANT = { organizationId: 'org_b' };

const TYPE_REPS = 'mt_repetitions';
const TYPE_ROM = 'mt_range_of_motion';
const TYPE_ANGLE = 'mt_joint_angle';

const TYPE_KEYS = {
  [TYPE_REPS]: 'repetitions',
  [TYPE_ROM]: 'range_of_motion',
  [TYPE_ANGLE]: 'joint_angle',
};

const CONFIGURATION = moduleConfigurationSchema.parse({
  measurementTypes: [{ measurementTypeId: TYPE_REPS }, { measurementTypeId: TYPE_ROM }],
  recordsSide: true,
  dimensions: [],
});

/** The shape the automatically created video-analysis test now carries. */
const WITH_ANGLES = moduleConfigurationSchema.parse({
  measurementTypes: [{ measurementTypeId: TYPE_ANGLE }],
  recordsSide: true,
  dimensions: [
    { key: JOINT_DIMENSION_KEY, label: 'Gelenk' },
    { key: POSITION_DIMENSION_KEY, label: 'Position' },
  ],
});

const WITH_JOINT = moduleConfigurationSchema.parse({
  measurementTypes: [{ measurementTypeId: TYPE_ROM }],
  recordsSide: true,
  dimensions: [{ key: JOINT_DIMENSION_KEY, label: 'Gelenk' }],
});

const DEG = Math.PI / 180;

/** The same stick figure the domain tests use, so the values are real ones. */
function squatVideo(count: number): PoseFrame[] {
  const frames: PoseFrame[] = [];
  const push = (depth: number, index: number) => {
    const shank = 2 + 43 * depth;
    const thigh = 3 + 52 * depth;
    const trunk = 2 + 38 * depth;

    const point = (x: number, y: number) => ({ x, y, z: 0, visibility: 1 });
    const ankle = { x: 0.5, y: 0.9 };
    const knee = {
      x: ankle.x + 0.2 * Math.sin(shank * DEG),
      y: ankle.y - 0.2 * Math.cos(shank * DEG),
    };
    const hip = {
      x: knee.x - 0.2 * Math.sin(thigh * DEG),
      y: knee.y - 0.2 * Math.cos(thigh * DEG),
    };
    const shoulder = {
      x: hip.x + 0.28 * Math.sin(trunk * DEG),
      y: hip.y - 0.28 * Math.cos(trunk * DEG),
    };

    const pose = Array.from({ length: 33 }, () => point(0, 0));
    const place = (left: number, right: number, at: { x: number; y: number }) => {
      pose[left] = point(at.x, at.y);
      pose[right] = point(at.x + 0.01, at.y);
    };

    place(11, 12, shoulder);
    place(23, 24, hip);
    place(25, 26, knee);
    place(27, 28, ankle);
    place(29, 30, { x: ankle.x - 0.03, y: ankle.y });
    place(31, 32, { x: ankle.x + 0.09, y: ankle.y });

    frames.push({ timestampMs: index * 33, landmarks: pose, aspectRatio: 1 });
  };

  let index = 0;
  for (let rep = 0; rep < count; rep += 1) {
    for (let i = 0; i < 10; i += 1) push(0, index++);
    for (let i = 0; i < 30; i += 1) push((i + 1) / 30, index++);
    for (let i = 0; i < 30; i += 1) push(1 - (i + 1) / 30, index++);
  }
  for (let i = 0; i < 10; i += 1) push(0, index++);

  return frames;
}

function measure(tracks: readonly string[]): MovementResult {
  const outcome = analyseMovement(squatVideo(3), SQUAT_PROFILE, tracks);
  if (!outcome.ok) throw new Error('the fixture video should analyse');

  return outcome.result;
}

const ALL_TRACKS = SQUAT_PROFILE.tracks.map((track) => track.key);

interface QueryArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

function fakeDb(options: { configuration?: unknown; owner?: string } = {}) {
  let written = 0;

  const measurement = {
    create: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockImplementation(() => {
      written += 1;

      return Promise.resolve({ id: `m_${String(written)}` });
    }),
  };

  const assessmentModule = {
    // Mirrors the real query: the lookup is tenant-scoped, so a module of
    // another workspace simply is not found.
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockImplementation((args) => {
      const asked = args.where?.organizationId;

      return Promise.resolve(
        asked === (options.owner ?? 'org_a')
          ? {
              id: 'mod_1',
              moduleVersion: 2,
              payload: options.configuration ?? CONFIGURATION,
              organizationId: options.owner ?? 'org_a',
            }
          : null,
      );
    }),
  };

  const store = {
    measurement,
    assessmentModule,
    measurementType: {
      findFirst: vi
        .fn<(args: QueryArgs) => Promise<unknown>>()
        .mockResolvedValue({ valueType: 'NUMERIC' }),
    },
    exercise: { findMany: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
    $transaction: <T>(run: (tx: unknown) => Promise<T>): Promise<T> => run(store),
  };

  return {
    db: store as unknown as Parameters<typeof recordMeasurements>[0],
    measurement,
    assessmentModule,
  };
}

/** The inputs the screen would send for a given configuration. */
const inputsFor = (configuration: typeof CONFIGURATION, tracks: readonly string[] = ALL_TRACKS) =>
  storableOf(
    planMeasurements(
      movementValues(measure(tracks), SQUAT_PROFILE),
      configuration,
      TYPE_KEYS,
      undefined,
      'Aus Videoanalyse.',
    ),
  ).map((entry) => ({
    moduleId: 'mod_1',
    measurementTypeId: entry.measurementTypeId,
    value: entry.value,
    side: entry.side,
    exerciseId: entry.exerciseId,
    passIndex: entry.passIndex,
    context: entry.context,
    note: entry.note,
    source: 'DERIVED' as const,
  }));

describe('saving what the analysis computed', () => {
  it('writes the values the plan produced', async () => {
    const { db, measurement } = fakeDb();
    const inputs = inputsFor(CONFIGURATION);

    expect(inputs.length).toBeGreaterThan(0);

    const result = await recordMeasurements(db, TENANT, inputs);

    expect(result.ok).toBe(true);
    expect(measurement.create).toHaveBeenCalledTimes(inputs.length);
  });

  it('marks every row as derived', async () => {
    // What makes these readable as computed rather than typed in, everywhere
    // they later appear.
    const { db, measurement } = fakeDb();
    await recordMeasurements(db, TENANT, inputsFor(CONFIGURATION));

    for (const call of measurement.create.mock.calls) {
      expect(call[0].data).toMatchObject({ source: 'DERIVED' });
    }
  });

  it('stamps the workspace onto every row', async () => {
    const { db, measurement } = fakeDb();
    await recordMeasurements(db, TENANT, inputsFor(CONFIGURATION));

    for (const call of measurement.create.mock.calls) {
      expect(call[0].data).toMatchObject({ organizationId: 'org_a' });
    }
  });

  it('carries the remark that says where the value came from', async () => {
    const { db, measurement } = fakeDb();
    await recordMeasurements(db, TENANT, inputsFor(CONFIGURATION));

    for (const call of measurement.create.mock.calls) {
      expect(call[0].data?.note).toBe('Aus Videoanalyse.');
    }
  });

  it('keeps the two positions of one joint apart', async () => {
    // Same joint, same side, same quantity — only the position separates them.
    const { db, measurement } = fakeDb({ configuration: WITH_ANGLES });
    await recordMeasurements(db, TENANT, inputsFor(WITH_ANGLES));

    const contexts = measurement.create.mock.calls
      .filter((call) => call[0].data?.side === 'LEFT')
      .map((call) => JSON.stringify(call[0].data?.context));

    expect(contexts.length).toBeGreaterThan(1);
    expect(new Set(contexts).size).toBe(contexts.length);
  });

  it('writes the joint onto the context where the test declares one', async () => {
    const { db, measurement } = fakeDb({ configuration: WITH_JOINT });
    await recordMeasurements(db, TENANT, inputsFor(WITH_JOINT));

    expect(measurement.create).toHaveBeenCalled();

    const joints = measurement.create.mock.calls.map(
      (call) =>
        (call[0].data?.context as Record<string, string> | undefined)?.[JOINT_DIMENSION_KEY],
    );

    // Every row names its joint, and the joints are the profile's own.
    for (const joint of joints) expect(['knee', 'hip', 'ankle']).toContain(joint);
    // More than one, or the axis would not be doing anything.
    expect(new Set(joints).size).toBeGreaterThan(1);
  });

  it('keeps left and right on separate rows', async () => {
    const { db, measurement } = fakeDb({ configuration: WITH_ANGLES });
    await recordMeasurements(db, TENANT, inputsFor(WITH_ANGLES));

    const sides = measurement.create.mock.calls.map((call) => call[0].data?.side);

    expect(sides).toContain('LEFT');
    expect(sides).toContain('RIGHT');
  });
});

describe('what never reaches the database', () => {
  it('stores no landmarks and no video', async () => {
    // Raw pose data is not a measurement, and the recording never leaves the
    // browser. Both would have to travel through this call to be persisted.
    const { db, measurement } = fakeDb();
    await recordMeasurements(db, TENANT, inputsFor(CONFIGURATION));

    const written = JSON.stringify(measurement.create.mock.calls);

    expect(written).not.toContain('visibility');
    expect(written).not.toContain('landmarks');
    expect(written).not.toContain('signal');
    expect(written).not.toContain('video');
  });

  it('stores nothing for a quantity the catalogue does not hold', async () => {
    // The duration and the tempo are computed and shown, never written: the
    // catalogue has no quantity for either, so nothing may receive them.
    const { db, measurement } = fakeDb();
    await recordMeasurements(db, TENANT, inputsFor(CONFIGURATION, ['knee']));

    const values = measurement.create.mock.calls.map((call) => Number(call[0].data?.numericValue));

    expect(values).toContain(3);
    // A duration is a second-scale number and a tempo a per-minute one; neither
    // can appear among values that are all degrees or a count.
    for (const value of values) {
      expect(value === 0 || value > 2.5).toBe(true);
    }
  });
});

describe('the tenant boundary', () => {
  it('writes nothing into a module of another workspace', async () => {
    // The module belongs to org_a; the session says org_b. The lookup is scoped
    // by the session, so the module is simply not there.
    const { db, measurement } = fakeDb({ owner: 'org_a' });

    const result = await recordMeasurements(db, OTHER_TENANT, inputsFor(CONFIGURATION));

    expect(result.ok).toBe(false);
    expect(measurement.create).not.toHaveBeenCalled();
  });

  it('scopes the module lookup by the session, never by the request', async () => {
    const { db, assessmentModule } = fakeDb();
    await recordMeasurements(db, TENANT, inputsFor(CONFIGURATION));

    for (const call of assessmentModule.findFirst.mock.calls) {
      expect(call[0].where).toMatchObject({ organizationId: 'org_a' });
    }
  });

  it('cannot be talked into another workspace by the value list', async () => {
    // Nothing in the input names a workspace, and this is what keeps it that
    // way: an added `organizationId` would have to be ignored.
    const { db, measurement } = fakeDb();
    const smuggled = inputsFor(CONFIGURATION).map((input) => ({
      ...input,
      organizationId: 'org_b',
    }));

    await recordMeasurements(db, TENANT, smuggled);

    for (const call of measurement.create.mock.calls) {
      expect(call[0].data).toMatchObject({ organizationId: 'org_a' });
    }
  });
});

describe('the test context', () => {
  it('writes every value against the module it was analysed for', async () => {
    const { db, measurement } = fakeDb();
    await recordMeasurements(db, TENANT, inputsFor(CONFIGURATION));

    for (const call of measurement.create.mock.calls) {
      expect(call[0].data).toMatchObject({ assessmentModuleId: 'mod_1' });
    }
  });

  it('refuses the whole batch when one value does not fit the test', async () => {
    // A stage is saved whole or not at all — the analysis inherits that rather
    // than half-writing a result.
    const { db, measurement } = fakeDb();
    const inputs = [
      ...inputsFor(CONFIGURATION),
      {
        moduleId: 'mod_1',
        measurementTypeId: 'mt_not_in_this_test',
        value: 42,
        side: 'BILATERAL' as const,
        exerciseId: null,
        passIndex: null,
        context: null,
        note: null,
        source: 'DERIVED' as const,
      },
    ];

    const result = await recordMeasurements(db, TENANT, inputs);

    expect(result.ok).toBe(false);
    expect(measurement.create).not.toHaveBeenCalled();
  });
});
