import { describe, expect, it, vi } from 'vitest';

import { openAnalysisTarget } from './analysis-target';

/**
 * Opening the place a standalone analysis is filed under.
 *
 * This is the only path in the application that may create three objects at
 * once, so what is asserted here is the restraint: it reuses before it creates,
 * it never crosses a workspace, and it never writes a question the coach did not
 * write. Each of those, done wrongly, produces a plausible-looking record that
 * belongs to nobody in particular.
 */

const TENANT = { organizationId: 'org_a' };
const OTHER_TENANT = { organizationId: 'org_b' };

interface QueryArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

const CONFIGURATION = {
  measurementTypes: [{ measurementTypeId: 'mt_rom', role: 'required' as const }],
  exerciseIds: [],
  passes: 1,
  recordsSide: true,
  dimensions: [{ key: 'joint', label: 'Gelenk' }],
};

function fakeDb(
  options: {
    existingModule?: boolean;
    athleteOwner?: string;
    noType?: boolean;
    /** Whether the named examination is this workspace's and this athlete's. */
    namedAssessment?: boolean;
  } = {},
) {
  const assessment = {
    create: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue({ id: 'as_new' }),
    findFirst: vi
      .fn<(args: QueryArgs) => Promise<unknown>>()
      .mockResolvedValue(options.namedAssessment === true ? { id: 'as_chosen' } : null),
  };

  const assessmentModule = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue(
      options.existingModule === true
        ? {
            id: 'mod_existing',
            assessmentId: 'as_existing',
            payload: CONFIGURATION,
            moduleVersion: 2,
          }
        : null,
    ),
    create: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue({ id: 'mod_new' }),
  };

  const performanceCase = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue(null),
    create: vi
      .fn<(args: QueryArgs) => Promise<unknown>>()
      .mockResolvedValue({ id: 'case_new', athleteId: 'ath_1' }),
  };

  const athlete = {
    findFirst: vi
      .fn<(args: QueryArgs) => Promise<unknown>>()
      .mockImplementation((args) =>
        Promise.resolve(
          args.where?.organizationId === (options.athleteOwner ?? 'org_a') ? { id: 'ath_1' } : null,
        ),
      ),
  };

  const measurementType = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>().mockResolvedValue(
      options.noType === true
        ? []
        : [
            { id: 'mt_angle', key: 'joint_angle' },
            { id: 'mt_rom', key: 'range_of_motion' },
          ],
    ),
  };

  const db = { athlete, performanceCase, assessment, assessmentModule, measurementType };

  return {
    db: db as unknown as Parameters<typeof openAnalysisTarget>[0],
    athlete,
    performanceCase,
    assessment,
    assessmentModule,
  };
}

const input = {
  athleteId: 'ath_1',
  purpose: 'Kniebeugentiefe vor Saisonstart',
  profileKey: 'squat',
  tracks: ['knee', 'hip'],
  targets: [{ track: 'knee', position: 'flexed', comparison: 'at_most' as const, degrees: 90 }],
};

describe('reusing before creating', () => {
  it('files into the athlete existing video-analysis test', async () => {
    const { db, assessment, assessmentModule } = fakeDb({ existingModule: true });

    const result = await openAnalysisTarget(db, TENANT, 'coach_1', input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.moduleId).toBe('mod_existing');
    expect(result.created).toBe(false);
    // The point: a second analysis must not start a parallel record.
    expect(assessment.create).not.toHaveBeenCalled();
    expect(assessmentModule.create).not.toHaveBeenCalled();
  });

  it('looks for that test through the athlete, not by name alone', async () => {
    const { db, assessmentModule } = fakeDb({ existingModule: true });

    await openAnalysisTarget(db, TENANT, 'coach_1', input);

    expect(assessmentModule.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      organizationId: 'org_a',
      assessment: { case: { athleteId: 'ath_1' } },
    });
  });

  it('does not rewrite the question of an assessment it reuses', async () => {
    const { db, assessment } = fakeDb({ existingModule: true });

    await openAnalysisTarget(db, TENANT, 'coach_1', {
      ...input,
      purpose: 'Etwas ganz anderes',
    });

    expect(assessment.create).not.toHaveBeenCalled();
  });
});

describe('opening a test when there is none', () => {
  it('creates case, assessment and module', async () => {
    const { db, performanceCase, assessment, assessmentModule } = fakeDb();

    const result = await openAnalysisTarget(db, TENANT, 'coach_1', input);

    expect(result.ok && result.created).toBe(true);
    expect(performanceCase.create).toHaveBeenCalled();
    expect(assessment.create).toHaveBeenCalled();
    expect(assessmentModule.create).toHaveBeenCalled();
  });

  it('uses the words the coach wrote as the question', async () => {
    // Every assessment answers a question, and generating one would be the
    // fabrication the domain forbids.
    const { db, assessment } = fakeDb();

    await openAnalysisTarget(db, TENANT, 'coach_1', input);

    expect(assessment.create.mock.calls[0]?.[0].data).toMatchObject({
      question: 'Kniebeugentiefe vor Saisonstart',
    });
  });

  it('names the test so the next analysis finds it again', async () => {
    const { db, assessmentModule } = fakeDb();

    await openAnalysisTarget(db, TENANT, 'coach_1', input);

    expect(assessmentModule.create.mock.calls[0]?.[0].data).toMatchObject({
      name: 'Videoanalyse',
      moduleKey: 'movement',
    });
  });

  it('stores the angles and targets the coach chose, on the test', async () => {
    // Two tests of the same exercise may legitimately track different angles
    // and aim at different numbers. Opening the test later has to show what
    // *this* analysis was judged against.
    const { db, assessmentModule } = fakeDb();

    await openAnalysisTarget(db, TENANT, 'coach_1', input);

    const payload = assessmentModule.create.mock.calls[0]?.[0].data?.['payload'] as {
      movement: { profileKey: string; tracks: string[]; targets: { track: string }[] };
    };

    expect(payload.movement).toMatchObject({ profileKey: 'squat', tracks: ['knee', 'hip'] });
    expect(payload.movement.targets).toHaveLength(1);
  });

  it('refuses a profile nobody ships', async () => {
    // Guessing a replacement would file one movement numbers under another name.
    const { db, assessmentModule } = fakeDb();

    const result = await openAnalysisTarget(db, TENANT, 'coach_1', {
      ...input,
      profileKey: 'clean_and_jerk',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.reason).toBe('UNKNOWN_PROFILE');
    expect(assessmentModule.create).not.toHaveBeenCalled();
  });

  it('configures the test to tell a knee from a hip and a bottom from a stand', async () => {
    const { db, assessmentModule } = fakeDb();

    await openAnalysisTarget(db, TENANT, 'coach_1', input);

    const payload = assessmentModule.create.mock.calls[0]?.[0].data?.['payload'] as {
      dimensions: { key: string }[];
      measurementTypes: { measurementTypeId: string }[];
      recordsSide: boolean;
      passes: number;
    };

    expect(payload.dimensions.map((d) => d.key)).toEqual(['joint', 'position']);
    expect(payload.recordsSide).toBe(true);
    // Angles, not ranges: a range spans both positions and so has no honest
    // value for the axis this test declares.
    expect(payload.measurementTypes.map((entry) => entry.measurementTypeId)).toEqual(['mt_angle']);
    // Not passes: an analysis is grouped by its instant, and a growing pass
    // count would leave the test permanently "incomplete".
    expect(payload.passes).toBe(1);
  });

  it('hands back the keys of every type it found, not only the one it configured', async () => {
    // A reused test may predate this shape and still record ranges; the plan
    // maps against whatever that module declares.
    const { db } = fakeDb();

    const result = await openAnalysisTarget(db, TENANT, 'coach_1', input);

    expect(result.ok && result.typeKeys).toEqual({
      mt_angle: 'joint_angle',
      mt_rom: 'range_of_motion',
    });
  });

  it('stamps the workspace on everything it creates', async () => {
    const { db, assessment, assessmentModule } = fakeDb();

    await openAnalysisTarget(db, TENANT, 'coach_1', input);

    expect(assessment.create.mock.calls[0]?.[0].data).toMatchObject({ organizationId: 'org_a' });
    expect(assessmentModule.create.mock.calls[0]?.[0].data).toMatchObject({
      organizationId: 'org_a',
    });
  });
});

describe('the tenant boundary', () => {
  it('refuses an athlete of another workspace', async () => {
    // The rows would each be correctly scoped; the leak would be the
    // *relationship*, which no column constraint catches.
    const { db, assessment, assessmentModule } = fakeDb({ athleteOwner: 'org_a' });

    const result = await openAnalysisTarget(db, OTHER_TENANT, 'coach_1', input);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.reason).toBe('ATHLETE_NOT_FOUND');
    expect(assessment.create).not.toHaveBeenCalled();
    expect(assessmentModule.create).not.toHaveBeenCalled();
  });

  it('checks the athlete before anything else happens', async () => {
    const { db, athlete } = fakeDb({ athleteOwner: 'org_a' });

    await openAnalysisTarget(db, OTHER_TENANT, 'coach_1', input);

    expect(athlete.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      organizationId: 'org_b',
      id: 'ath_1',
    });
  });
});

describe('when the catalogue cannot support it', () => {
  it('refuses rather than opening a test that can hold nothing', async () => {
    const { db, assessmentModule } = fakeDb({ noType: true });

    const result = await openAnalysisTarget(db, TENANT, 'coach_1', input);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.reason).toBe('CATALOGUE_INCOMPLETE');
    expect(assessmentModule.create).not.toHaveBeenCalled();
  });
});

/**
 * Filing into an examination the coach picked.
 *
 * The point of the option: an analysis that sits beside the other tests of one
 * examination is reported with them. What is asserted is that it lands in *that*
 * examination, that it is a test of its own rather than a reuse, and that a
 * named examination is checked against the athlete as well as the workspace —
 * an analysis filed under somebody else's examination would put one athlete's
 * angles under another's name.
 */
describe('filing into a chosen assessment', () => {
  it('creates the test inside it and opens no examination', async () => {
    const fake = fakeDb({ namedAssessment: true });

    const result = await openAnalysisTarget(fake.db, TENANT, 'coach_1', {
      ...input,
      assessmentId: 'as_chosen',
    });

    expect(result).toMatchObject({ ok: true, assessmentId: 'as_chosen', moduleId: 'mod_new' });
    expect(fake.assessment.create).not.toHaveBeenCalled();
    expect(fake.performanceCase.create).not.toHaveBeenCalled();
    expect(fake.assessmentModule.create.mock.calls[0]?.[0].data).toMatchObject({
      assessmentId: 'as_chosen',
    });
  });

  it("names the test after the coach's own words", async () => {
    const fake = fakeDb({ namedAssessment: true });

    await openAnalysisTarget(fake.db, TENANT, 'coach_1', { ...input, assessmentId: 'as_chosen' });

    expect(fake.assessmentModule.create.mock.calls[0]?.[0].data).toMatchObject({
      name: 'Kniebeugentiefe vor Saisonstart',
    });
  });

  it('asks for the examination by athlete as well as by workspace', async () => {
    const fake = fakeDb({ namedAssessment: true });

    await openAnalysisTarget(fake.db, TENANT, 'coach_1', { ...input, assessmentId: 'as_chosen' });

    expect(fake.assessment.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      id: 'as_chosen',
      organizationId: 'org_a',
      case: { athleteId: 'ath_1' },
    });
  });

  it('refuses an examination that is not theirs, and writes nothing', async () => {
    const fake = fakeDb({ namedAssessment: false });

    const result = await openAnalysisTarget(fake.db, TENANT, 'coach_1', {
      ...input,
      assessmentId: 'as_somebody_elses',
    });

    expect(result).toEqual({ ok: false, reason: 'ASSESSMENT_NOT_FOUND' });
    expect(fake.assessmentModule.create).not.toHaveBeenCalled();
    expect(fake.assessment.create).not.toHaveBeenCalled();
  });

  it("reuses the athlete's own test when no examination was named", async () => {
    const fake = fakeDb({ existingModule: true });

    const result = await openAnalysisTarget(fake.db, TENANT, 'coach_1', input);

    expect(result).toMatchObject({ ok: true, moduleId: 'mod_existing' });
    expect(fake.assessmentModule.create).not.toHaveBeenCalled();
  });
});
