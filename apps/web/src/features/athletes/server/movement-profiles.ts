import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped } from '@apex/database/tenant';
import {
  hasTempo,
  meetsAngleTarget,
  movementProfile,
  positionOf,
  readModuleConfiguration,
  setTempo,
  SIDE_LABELS_DE,
  analysisStillFolder,
  MAX_STILLS_PER_MODULE,
  parseAnalysisStillKey,
  targetForReading,
  trackOf,
  type SetTempo,
} from '@apex/domain';
import type { TenantContext } from '@apex/types';

import { ANALYSIS_MODULE_NAME } from '@/features/assessments';
import { listObjects } from '@/integrations/object-store';

/**
 * The movements this athlete has had analysed.
 *
 * ## Why the profile page does not carry the analysis
 *
 * A video analysis belongs to the test it ran on, and the report is where it is
 * read in full. What a profile needs is the other question — *has this movement
 * been looked at, and when* — so this returns a headline and a way in, and
 * nothing that would be a second copy of the analysis.
 *
 * ## Why this is not a tracking card
 *
 * A trend card follows one quantity a coach chose to watch. A movement profile
 * is a professional reading of one movement, with repetitions, angles and a
 * recording behind it. Putting them in one list would suggest they are the same
 * kind of statement, and they are not — so they stay two sections.
 *
 * ## Why the configurations are read rather than filtered in SQL
 *
 * Which tests carry an analysis is a property of a JSON payload, and a database
 * filter over it would encode the payload's shape in a query. The set is small —
 * one athlete's tests — and bounded here, so it is read and filtered in code
 * against the very schema that wrote it.
 */

type MovementDb = Pick<PrismaClientInstance, 'assessmentModule' | 'measurement' | 'note'>;

/** How many tests back this looks. Generous for a profile, bounded for a query. */
const LOOKBACK = 60;

/** How many angles a card names before it becomes a table. */
const HEADLINE_ANGLES = 3;

export interface MovementProfileCard {
  readonly moduleId: string;
  readonly assessmentId: string;
  /** The test's own name, which is what the coach called this analysis. */
  readonly name: string;
  readonly profileName: string;
  readonly performedAt: Date;
  readonly repetitions: number;
  /** The angles this analysis measured, the first few, newest reading each. */
  readonly angles: readonly { key: string; label: string; degrees: number }[];
  /** `null` where the recording cannot support a statement about tempo. */
  readonly tempo: SetTempo | null;
  /** Every angle, with the target it was judged against. What the table shows. */
  readonly rows: readonly {
    readonly key: string;
    readonly coordinates: string;
    /** The same coordinates apart, so the angle grid can pivot on them. */
    readonly track: string | null;
    readonly side: string | null;
    readonly position: string | null;
    readonly degrees: number;
    readonly target: {
      comparison: 'at_most' | 'at_least' | 'equals';
      degrees: number;
      met: boolean;
    } | null;
  }[];
  readonly movement: {
    /** Which profile drew this. Decides the order of the angle grid's columns. */
    profileKey: string;
    profileName: string;
    repetitions: number;
    durationMs: number;
    signal: readonly { timestampMs: number; primary: number | null }[];
    reps: readonly { index: number; startedAtMs: number; endedAtMs: number; durationMs: number }[];
    tempo: SetTempo | null;
  };
  /**
   * What the coach wrote when they filed the analysis.
   *
   * A Note on the test (§20) — the mechanism that already exists for "what the
   * coach makes of this test". Read rather than restated: the profile shows the
   * remark that belongs to the analysis, not a second one.
   */
  readonly remark: string | null;
  /**
   * Where this analysis stands with the athlete.
   *
   * Both are properties of the **assessment's** report, not of the analysis:
   * publishing and sharing happen to a document, and an analysis reaches an
   * athlete by being in one. Read here so the tile can say so without a second
   * query per card.
   */
  readonly published: boolean;
  readonly shared: boolean;
  /**
   * The stills of this analysis, while they are still there.
   *
   * The working files of the run, not a third copy: `analysis-temp` holds them
   * until a report freezes the chosen ones or the sweep clears them after
   * fourteen days. Showing them here is what makes the profile the analysis a
   * coach recognises rather than a description of one — and when they are gone
   * the card says so, which is true and is what the placeholder is for.
   */
  readonly images: readonly { id: string; key: string; label: string }[];
}

/**
 * What this analysis is called.
 *
 * A test a coach set up themselves carries their name and that wins. An analysis
 * filed from the video screen carries none — the test is opened for it and named
 * "Videoanalyse", while the words the coach typed became the question of the
 * assessment it opened. So that question is the name here, and the generic one
 * is what remains when there is nothing better.
 */
function nameOf(
  module: { name: string | null; assessment: { question: string } },
  profileName: string | null,
): string {
  const own = (module.name ?? '').trim();
  const purpose = module.assessment.question.trim();

  if (own !== '' && own !== ANALYSIS_MODULE_NAME) return own;
  if (purpose !== '') return purpose;

  return own === '' ? (profileName ?? 'Bewegung') : own;
}

/**
 * Which analyses to read: every one of an athlete's, or one particular test.
 *
 * The same assembly answers both. A test screen wants the analysis it carries
 * and a profile wants the list, and the reading is identical — a second
 * implementation for the single case is the one that would drift.
 */
export type MovementSelector = { readonly athleteId: string } | { readonly moduleId: string };

export async function movementProfilesFor(
  db: MovementDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  selector: MovementSelector,
): Promise<readonly MovementProfileCard[]> {
  // One moment for every "is this link still open" question below, so two cards
  // of the same assessment cannot disagree because a second ticked over.
  const now = new Date();

  const modules = await db.assessmentModule.findMany({
    where: scoped(tenant, {
      // An archived test still opens: a coach who put one away and follows a
      // link to it should read it, not meet an empty page. The *listing* filters
      // archived tests out; asking for one by id is asking for that one.
      ...('moduleId' in selector
        ? { id: selector.moduleId }
        : { archivedAt: null, assessment: { case: { athleteId: selector.athleteId } } }),
    }),
    select: {
      id: true,
      name: true,
      moduleKey: true,
      payload: true,
      moduleVersion: true,
      assessment: {
        select: {
          id: true,
          performedAt: true,
          // What the coach typed when they filed the analysis. A standalone
          // analysis opens its own assessment and puts the purpose there, so
          // this is where "Wall Balls Technik" lives — the test itself is
          // always called `ANALYSIS_MODULE_NAME`.
          question: true,
          // One document per assessment in practice; `some` rather than a join
          // so an assessment without one simply answers false.
          reports: {
            select: {
              status: true,
              shares: {
                where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
    orderBy: [{ assessment: { performedAt: 'desc' } }, { createdAt: 'desc' }],
    take: LOOKBACK,
  });

  const analysed = modules.flatMap((entry) => {
    const configuration = readModuleConfiguration(entry.payload, entry.moduleVersion);
    const result = configuration?.movement?.result;

    if (configuration?.movement === undefined || result === undefined) return [];

    return [{ module: entry, movement: configuration.movement, result }];
  });

  if (analysed.length === 0) return [];

  // One query for every angle of every analysed test, rather than one per card.
  const angles = await db.measurement.findMany({
    where: scoped(tenant, {
      supersededById: null,
      assessmentModuleId: { in: analysed.map((entry) => entry.module.id) },
      measurementType: { key: 'joint_angle' },
    }),
    select: {
      assessmentModuleId: true,
      numericValue: true,
      context: true,
      capturedAt: true,
      side: true,
      measurementTypeId: true,
    },
    orderBy: [{ capturedAt: 'desc' }],
  });

  const profileOf = new Map(
    analysed.map((entry) => [entry.module.id, movementProfile(entry.movement.profileKey)]),
  );
  const configOf = new Map(
    analysed.map((entry) => [
      entry.module.id,
      readModuleConfiguration(entry.module.payload, entry.module.moduleVersion),
    ]),
  );

  const notes = await db.note.findMany({
    where: scoped(tenant, { assessmentModuleId: { in: analysed.map((e) => e.module.id) } }),
    select: { assessmentModuleId: true, body: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }],
  });
  const remarkOf = new Map<string, string>();
  for (const note of notes) {
    if (note.assessmentModuleId !== null && !remarkOf.has(note.assessmentModuleId)) {
      remarkOf.set(note.assessmentModuleId, note.body);
    }
  }

  const rowsOf = new Map<
    string,
    {
      key: string;
      coordinates: string;
      track: string | null;
      side: string | null;
      position: string | null;
      degrees: number;
      target: {
        comparison: 'at_most' | 'at_least' | 'equals';
        degrees: number;
        met: boolean;
      } | null;
    }[]
  >();

  const byModule = new Map<string, { key: string; label: string; degrees: number }[]>();
  for (const row of angles) {
    const value = row.numericValue === null ? null : Number(row.numericValue.toString());
    if (value === null || !Number.isFinite(value)) continue;

    const profile = profileOf.get(row.assessmentModuleId) ?? null;
    const context = (row.context ?? {}) as Record<string, unknown>;

    /**
     * The axes a video-analysis test fills carry the profile's own keys, which
     * are the right thing to store and the wrong thing to show. Translated back
     * through the profile that wrote them; anything it does not know is already
     * the coach's own wording and stays.
     */
    const readable = (part: unknown): string | null => {
      if (typeof part !== 'string' || part === '') return null;
      if (profile === null) return part;

      return trackOf(profile, part)?.label ?? positionOf(profile, part)?.label ?? part;
    };

    // The side belongs in the label: left and right otherwise produce two rows
    // with the same name, which read as a duplicate and collided as a key.
    const label = [
      readable(context['joint']),
      SIDE_LABELS_DE[row.side] ?? null,
      readable(context['position']),
    ]
      .filter((part): part is string => part !== null)
      .join(' · ');

    const list = byModule.get(row.assessmentModuleId) ?? [];
    const key = `${row.assessmentModuleId}:${label}`;

    if (list.length < HEADLINE_ANGLES && !list.some((entry) => entry.key === key)) {
      list.push({ key, label: label === '' ? 'Winkel' : label, degrees: value });
    }
    byModule.set(row.assessmentModuleId, list);

    // The full table, with the target this reading was judged against.
    const configuration = configOf.get(row.assessmentModuleId) ?? null;
    const target = targetForReading(configuration, {
      measurementTypeId: row.measurementTypeId,
      side: row.side,
      context: Object.fromEntries(
        Object.entries(context).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      ),
    });

    const rows = rowsOf.get(row.assessmentModuleId) ?? [];
    rows.push({
      key: `${key}:${String(rows.length)}`,
      coordinates: label === '' ? 'Winkel' : label,
      // The three parts the joined label was built from, kept apart so the
      // angle grid pivots on them instead of splitting the label back up.
      track: readable(context['joint']) ?? readable(context['gelenk']),
      side: SIDE_LABELS_DE[row.side] ?? null,
      position: readable(context['position']),
      degrees: value,
      target:
        target === null
          ? null
          : {
              comparison: target.comparison,
              degrees: target.degrees,
              met: meetsAngleTarget(value, target),
            },
    });
    rowsOf.set(row.assessmentModuleId, rows);
  }

  /**
   * One listing per analysed test.
   *
   * Sequential rather than parallel: a profile holds a handful of analyses, and
   * a burst of listings against the store buys nothing worth the concurrency.
   * A store that is not configured answers empty, and the cards fall back to
   * their placeholders — which is the same outcome as an expired analysis.
   */
  const stillsOf = new Map<string, { id: string; key: string; label: string }[]>();
  for (const entry of analysed) {
    const found = await listObjects(
      analysisStillFolder(tenant.organizationId, entry.module.id),
      MAX_STILLS_PER_MODULE * 4,
    );
    const profile = profileOf.get(entry.module.id) ?? null;

    stillsOf.set(
      entry.module.id,
      found.flatMap((object) => {
        const parsed = parseAnalysisStillKey(object.key);
        if (parsed === null) return [];

        // The position keys are the profile's own; the coach reads its words.
        const label =
          profile === null
            ? parsed.position
            : (positionOf(profile, parsed.position)?.label ?? parsed.position);

        return [{ id: parsed.stillId, key: object.key, label }];
      }),
    );
  }

  return analysed.map((entry): MovementProfileCard => {
    const signal = entry.result.signal.map((point) => ({
      timestampMs: point.t,
      primary: point.v,
    }));
    const tempo = setTempo(signal, entry.result.reps);
    const profile = profileOf.get(entry.module.id) ?? null;

    return {
      moduleId: entry.module.id,
      assessmentId: entry.module.assessment.id,
      name: nameOf(entry.module, profile?.name ?? null),
      profileName: profile?.name ?? entry.movement.profileKey,
      performedAt: entry.module.assessment.performedAt,
      repetitions: entry.result.repetitions,
      angles: byModule.get(entry.module.id) ?? [],
      tempo: hasTempo(tempo) ? tempo : null,
      rows: rowsOf.get(entry.module.id) ?? [],
      movement: {
        profileKey: entry.movement.profileKey,
        profileName: profile?.name ?? entry.movement.profileKey,
        repetitions: entry.result.repetitions,
        durationMs: entry.result.durationMs,
        signal,
        reps: entry.result.reps,
        tempo: hasTempo(tempo) ? tempo : null,
      },
      remark: remarkOf.get(entry.module.id) ?? null,
      images: stillsOf.get(entry.module.id) ?? [],
      published: entry.module.assessment.reports.some((report) => report.status === 'PUBLISHED'),
      shared: entry.module.assessment.reports.some((report) => report.shares.length > 0),
    };
  });
}
