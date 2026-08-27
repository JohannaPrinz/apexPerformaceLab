import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  MODULE_CONFIGURATION_VERSION,
  movementProfile,
  type AngleTargetConfig,
  type ModuleConfiguration,
  type MovementAnalysisConfig,
} from '@apex/domain';
import type { TenantContext } from '@apex/types';

import { ensureOpenCase } from '@/services/case-provisioning';

/**
 * Finding — or opening — the test a standalone analysis belongs in.
 *
 * ## Why this exists
 *
 * A Measurement cannot live outside an AssessmentModule: the column is not
 * nullable, and making it so would fork every query and every authorization
 * path about an athlete's record. A video analysis that starts without an
 * athlete therefore has to *land* somewhere the moment the coach assigns it.
 *
 * The pattern is §8's, applied one level further. `ensureOpenCase` already
 * states it for the Case: **mandatory in the model, never a manual step**. The
 * same reasoning covers the Assessment and the Module here — a coach who wants
 * to file a video analysis should not first have to build the three objects
 * underneath it.
 *
 * ## What is not invented
 *
 * The Assessment's `question` is the coach's own words, taken from what they
 * typed when assigning the analysis. Every Assessment answers a question and
 * data is never collected without a purpose; generating that sentence would be
 * precisely the fabrication the domain forbids, so it is asked for instead.
 *
 * ## Why analyses are not passes
 *
 * A pass is declared upfront — the four stages of a lactate test — and readiness
 * is computed against that declaration. Modelling an open-ended series of
 * analyses as passes would leave every test permanently "incomplete" as soon as
 * the coach recorded one, and would split one athlete's knee range into a new
 * series per session, so no trend could ever be drawn across them.
 *
 * Instead every analysis writes its values under **one shared `capturedAt`**.
 * That groups them without a new concept, keeps a single comparable series per
 * joint and side, and makes "the analyses in this test" an ordinary read.
 */

type TargetDb = Pick<
  PrismaClientInstance,
  'athlete' | 'performanceCase' | 'assessment' | 'assessmentModule' | 'measurementType'
>;

/** The name every automatically created video-analysis test carries. */
export const ANALYSIS_MODULE_NAME = 'Videoanalyse';

/** The module key a movement analysis belongs under (§11). */
export const ANALYSIS_MODULE_KEY = 'movement';

export interface AnalysisTargetInput {
  readonly athleteId: string;
  /** Which movement profile the values were measured under. */
  readonly profileKey: string;
  /** The angles the coach kept, and the targets they set, for this test. */
  readonly tracks: readonly string[];
  readonly targets: readonly AngleTargetConfig[];
  /**
   * What the coach wants this analysis to answer.
   *
   * Becomes the Assessment's question when one has to be created. Ignored when
   * an existing test is reused — an assessment's question is not rewritten by a
   * later analysis.
   */
  readonly purpose: string;
}

export type AnalysisTargetResult =
  | {
      readonly ok: true;
      readonly moduleId: string;
      readonly assessmentId: string;
      /** Type id → catalogue key, for the values about to be planned. */
      readonly typeKeys: Readonly<Record<string, string>>;
      readonly configuration: ModuleConfiguration;
      /** Whether the test had to be created, so the screen can say so. */
      readonly created: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: 'ATHLETE_NOT_FOUND' | 'CATALOGUE_INCOMPLETE' | 'UNKNOWN_PROFILE';
    };

/**
 * The configuration an automatically created video-analysis test carries.
 *
 * **Joint angles, and deliberately not the range.** Two axes are needed: `joint`
 * to tell a knee from a hip, and `position` to tell the bottom of the squat from
 * standing. Every declared dimension is mandatory on every measurement of the
 * module (`measurementContextSchema`), and a *range* spans both positions — so
 * it has no honest value for that axis and cannot live in the same test. A
 * repetition count is excluded for the same reason.
 *
 * Nothing is lost by that: the range is the difference between the two angles
 * this test does record, while the reverse is not true — a range of 95° reached
 * from 130° instead of 175° is a different movement, and only the angles say
 * which one happened.
 *
 * A coach who wants the count or the range as measurements configures their own
 * test and runs the analysis from inside it, which still works.
 */
function analysisConfiguration(
  jointAngleTypeId: string,
  movement: MovementAnalysisConfig,
): ModuleConfiguration & { movement: MovementAnalysisConfig } {
  return {
    measurementTypes: [{ measurementTypeId: jointAngleTypeId, role: 'required' }],
    exerciseIds: [],
    passes: 1,
    recordsSide: true,
    dimensions: [
      { key: 'joint', label: 'Gelenk' },
      { key: 'position', label: 'Position' },
    ],
    // The coach's angle selection and targets travel with the test, so opening
    // it later shows what this analysis was actually judged against. An extra
    // key on a payload that is already versioned and validated — see
    // `analysis-config.ts` for why this is not a table.
    movement,
  };
}

/**
 * Opens the place a standalone analysis is filed under.
 *
 * Reuses the athlete's existing video-analysis test where there is one, so a
 * second analysis is appended rather than starting a parallel record.
 */
export async function openAnalysisTarget(
  db: TargetDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  { athleteId, purpose, profileKey, tracks, targets }: AnalysisTargetInput,
): Promise<AnalysisTargetResult> {
  // The parent is checked, never trusted: without this a caller could file an
  // analysis against another workspace's athlete. The rows would each be
  // correctly scoped and the leak would be the *relationship*.
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId }),
    select: { id: true },
  });

  if (!athlete) return { ok: false, reason: 'ATHLETE_NOT_FOUND' };

  // A profile nobody ships cannot be analysed, and guessing a replacement would
  // file one movement's numbers under another's name.
  if (movementProfile(profileKey) === null) return { ok: false, reason: 'UNKNOWN_PROFILE' };

  // Both, because a reused test may have been created under the earlier shape
  // that recorded ranges. The plan maps against whatever the module actually
  // declares, so an existing test keeps working unchanged.
  const types = await db.measurementType.findMany({
    where: {
      key: { in: ['joint_angle', 'range_of_motion'] },
      OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
    },
    select: { id: true, key: true },
  });

  const jointAngle = types.find((type) => type.key === 'joint_angle');
  if (!jointAngle) return { ok: false, reason: 'CATALOGUE_INCOMPLETE' };

  const typeKeys = Object.fromEntries(types.map((type) => [type.id, type.key]));

  const existing = await db.assessmentModule.findFirst({
    where: scoped(tenant, {
      moduleKey: ANALYSIS_MODULE_KEY,
      name: ANALYSIS_MODULE_NAME,
      archivedAt: null,
      assessment: { case: { athleteId } },
    }),
    select: { id: true, assessmentId: true, payload: true, moduleVersion: true },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    return {
      ok: true,
      moduleId: existing.id,
      assessmentId: existing.assessmentId,
      typeKeys,
      configuration: existing.payload as unknown as ModuleConfiguration,
      created: false,
    };
  }

  const openCase = await ensureOpenCase(db, tenant, createdByCoachId, athleteId, purpose);
  if (!openCase) return { ok: false, reason: 'ATHLETE_NOT_FOUND' };

  const configuration = analysisConfiguration(jointAngle.id, {
    profileKey,
    tracks: [...tracks],
    targets: [...targets],
  });

  const assessment = await db.assessment.create({
    data: withTenant(tenant, {
      caseId: openCase.id,
      question: purpose,
      // A video analysis observes how a movement looks now; it is neither a
      // first workup nor a repeat of a defined protocol.
      type: 'FOLLOW_UP' as const,
      performedAt: new Date(),
    }),
    select: { id: true },
  });

  const created = await db.assessmentModule.create({
    data: withTenant(tenant, {
      assessmentId: assessment.id,
      name: ANALYSIS_MODULE_NAME,
      moduleKey: ANALYSIS_MODULE_KEY,
      moduleVersion: MODULE_CONFIGURATION_VERSION,
      payload: configuration,
      createdByCoachId,
    }),
    select: { id: true },
  });

  return {
    ok: true,
    moduleId: created.id,
    assessmentId: assessment.id,
    typeKeys,
    configuration,
    created: true,
  };
}
