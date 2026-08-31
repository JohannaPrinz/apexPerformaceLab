import { z } from 'zod';

import { reportMediaSchema } from './report-media';

/**
 * What a published analysis is, frozen.
 *
 * ## Why the document is stored and not re-rendered
 *
 * §2: Reports are snapshots. An athlete who opens a link a week later must see
 * what the coach signed off, not what the record says today. Re-rendering from
 * live data would silently change a document somebody has already read — and a
 * correction entered afterwards would rewrite the past.
 *
 * So publication copies the facts as they stood into `Report.content`, and
 * nothing after that touches them. A later change is a new version.
 *
 * ## Why the direction and the target are frozen with the numbers
 *
 * A tendency — the green or red beside a change — is only sayable because the
 * test declared which way it wanted the number to go, and a target angle is only
 * met or missed against a threshold somebody set. Both live in the test's
 * configuration, which a coach may edit tomorrow.
 *
 * If the document looked either up at read time, a coach changing a target next
 * month would silently turn a met target into a missed one in a document an
 * athlete has already read. So both are copied in, and the frozen document needs
 * nothing but itself to render.
 *
 * ## Why it is versioned and upgraded rather than half-read
 *
 * A payload written by a shape this code does not know is refused outright. A
 * document that is half understood is worse than one that will not open, because
 * only the second is obvious. Shapes this code *has* written are upgraded on
 * read, and an upgrade may only add absences — never content the document never
 * carried.
 *
 * ## Dates
 *
 * Stored as ISO strings, because JSON has no date. They are parsed back on
 * read; nothing downstream sees a string where it expects a moment.
 */

export const REPORT_SNAPSHOT_VERSION = 6;

const pointSchema = z.object({ value: z.number(), capturedAt: z.string() });

/** A target the coach set for an angle, and whether this reading met it. */
const targetSchema = z.object({
  comparison: z.enum(['at_most', 'at_least', 'equals']),
  degrees: z.number(),
  /** Decided at publication, against the threshold as it stood then. */
  met: z.boolean(),
});

const seriesSchemaV2 = z.object({
  key: z.string(),
  typeName: z.string(),
  /** The catalogue key, so wording can be exact without a second lookup. */
  measurementTypeKey: z.string().default(''),
  unit: z.string(),
  side: z.string(),
  exerciseName: z.string().nullable(),
  /**
   * The catalogue key of the exercise, beside its name.
   *
   * The name is for reading; the key is what a rule matches on — the strength
   * standards are stated per lift, and matching them against a display name
   * would break the moment a workspace renamed one. Defaulted, because
   * documents frozen before this carried only the name.
   */
  exerciseKey: z.string().default(''),
  passIndex: z.number().int().nullable(),
  context: z.record(z.string(), z.string()),
  source: z.string(),
  current: pointSchema,
  previous: pointSchema.nullable(),
  difference: z.number().nullable(),
  best: pointSchema.nullable(),
  /** `null` where the test declared none — then no tendency may be shown. */
  betterDirection: z.enum(['lower', 'higher']).nullable().default(null),
  target: targetSchema.nullable().default(null),
  /**
   * Where the value stood among the workspace's athletes at publication.
   *
   * Frozen, like the target verdict: the comparison group grows as the workspace
   * measures more people, and a document that recomputed it would quietly move
   * an athlete's standing after they had read it. The group size travels with it
   * because "68th percentile" without "of 12" is not a statement.
   */
  percentile: z
    .object({ percentile: z.number(), cohort: z.number().int() })
    .nullable()
    .default(null),
});

/**
 * What a video analysis saw, frozen with the document.
 *
 * The curve travels with the report for the same reason the target verdict does:
 * a coach may re-run the analysis tomorrow, and the picture an athlete was shown
 * must not change underneath them. Tempo is **not** frozen — it follows from the
 * curve by arithmetic, so recomputing it from the frozen curve gives the frozen
 * answer, and storing it too would be a second copy to keep in step.
 */
const snapshotMovementSchema = z.object({
  /**
   * The profile's key as well as its name.
   *
   * The name is for reading; the key is what says which positions this movement
   * has and in which order — "gestreckt" before "gebeugt", because that is the
   * order the analysis screen lays them out in. Defaulted, because documents
   * frozen before this carried only the name, and a table ordered by first
   * appearance is the honest reading of one.
   */
  profileKey: z.string().default(''),
  profileName: z.string(),
  repetitions: z.number().int().min(0),
  durationMs: z.number().min(0),
  reps: z.array(
    z.object({
      index: z.number().int().min(0),
      startedAtMs: z.number().min(0),
      endedAtMs: z.number().min(0),
      durationMs: z.number().min(0),
    }),
  ),
  signal: z.array(z.object({ timestampMs: z.number().min(0), primary: z.number().nullable() })),
});

/**
 * A staged test as a curve, frozen with the document.
 *
 * The shape a lactate test has: one point per stage, and an axis that may be the
 * stage number or any quantity the run recorded at that stage — speed, load,
 * heart rate. Which one the protocol calls the demand travels with it, because
 * a coach editing the protocol next month must not redraw a document an athlete
 * has already read.
 */
const snapshotChartSchema = z.object({
  key: z.string(),
  typeName: z.string(),
  unit: z.string(),
  side: z.string(),
  exerciseName: z.string().nullable(),
  context: z.record(z.string(), z.string()),
  loadCandidates: z.array(z.object({ id: z.string(), name: z.string(), unit: z.string() })),
  defaultLoadId: z.string().nullable(),
  series: z.array(
    z.object({
      moduleId: z.string(),
      moduleName: z.string().nullable(),
      moduleStatus: z.string(),
      isCurrentModule: z.boolean(),
      points: z.array(
        z.object({
          passIndex: z.number().int().nullable(),
          y: z.number(),
          loads: z.record(z.string(), z.number()),
        }),
      ),
    }),
  ),
});

const moduleSchemaV2 = z.object({
  moduleId: z.string(),
  name: z.string(),
  typeLabel: z.string(),
  /** When the test was carried out, and how far it got — frozen with the rest. */
  performedAt: z.string().default(''),
  statusLabel: z.string().default(''),
  protocolLabel: z.string().nullable(),
  derivations: z.array(z.string()),
  series: z.array(seriesSchemaV2),
  /** The stills the coach chose, copied into this document at publication. */
  media: z.array(reportMediaSchema).default([]),
  /** `null` for every test without a video behind it. */
  movement: snapshotMovementSchema.nullable().default(null),
  /** Staged tests as curves. Empty for a test that records one value per series. */
  charts: z.array(snapshotChartSchema).default([]),
  interpretation: z.string(),
  recommendation: z.string(),
});

export const reportSnapshotSchema = z.object({
  version: z.literal(REPORT_SNAPSHOT_VERSION),
  /** When it was frozen. The document's own date, not the assessment's. */
  publishedAt: z.string(),
  assessment: z.object({ performedAt: z.string() }),
  athlete: z.object({
    firstName: z.string(),
    lastName: z.string(),
    /**
     * Body height in centimetres and date of birth, frozen like everything else.
     *
     * Both are read from the athlete record at publication and never afterwards:
     * a BMI printed in a document must keep meaning what it meant on the day,
     * and an age must be the age at the test, not the age at reading. Nullable
     * and defaulted, because neither is required of an athlete and because every
     * document written before this field existed carried neither — the truthful
     * reading of those is "not recorded", which is what the default says.
     */
    heightCm: z.number().nullable().default(null),
    dateOfBirth: z.string().nullable().default(null),
    /**
     * Body weight and sex, frozen like the rest.
     *
     * Both are what the strength standards are read against — a multiple of
     * body weight means nothing without the weight, and the table states
     * different bands per sex. Nullable and defaulted for the same reason as
     * the two above: neither is required of an athlete, and no document written
     * before this carried them.
     */
    weightKg: z.number().nullable().default(null),
    sex: z.string().nullable().default(null),
  }),
  coach: z.object({ name: z.string() }),
  modules: z.array(moduleSchemaV2),
  overall: z.object({ interpretation: z.string(), recommendation: z.string() }),
});

export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;
export type SnapshotModule = z.infer<typeof moduleSchemaV2>;
export type SnapshotSeries = z.infer<typeof seriesSchemaV2>;
export type SnapshotTarget = z.infer<typeof targetSchema>;
export type SnapshotMovement = z.infer<typeof snapshotMovementSchema>;
export type SnapshotChart = z.infer<typeof snapshotChartSchema>;

/**
 * The shapes this code has written, older first.
 *
 * Every field added since version 1 carries a default, so an older payload
 * parses against the current body and the upgrade only fills in **absences** —
 * no direction was declared, no target was checked, no picture was chosen, no
 * curve was kept. That is the truthful reading of a document that never had
 * them, and it is why an old link keeps opening.
 */
const olderSnapshotSchemas = [1, 2, 3, 4, 5].map((version) =>
  reportSnapshotSchema.extend({ version: z.literal(version) }),
);

/** Reads a stored snapshot, or `null` where there is none or it is unreadable. */
export function readReportSnapshot(payload: unknown): ReportSnapshot | null {
  const parsed = reportSnapshotSchema.safeParse(payload);
  if (parsed.success) return parsed.data;

  for (const schema of olderSnapshotSchemas) {
    const older = schema.safeParse(payload);
    if (older.success) return { ...older.data, version: REPORT_SNAPSHOT_VERSION };
  }

  return null;
}

/**
 * What a shared document shows, and what it deliberately leaves out.
 *
 * The athlete sees the results and what the coach wrote about them. They do not
 * see the assessment's **question** — a coach's own wording of why they
 * examined somebody, which regularly names an injury or an operation and is
 * written for the record rather than for the person. It stays in the workspace.
 *
 * They also do not see which tests were set aside, or how full the examination
 * was: those are the coach's working notes about their own thoroughness.
 */
export function snapshotIsEmpty(snapshot: ReportSnapshot): boolean {
  return snapshot.modules.every(
    (entry) =>
      entry.series.length === 0 &&
      entry.media.length === 0 &&
      entry.movement === null &&
      entry.charts.length === 0,
  );
}

/** Every stored object a published analysis owns. What deleting it must remove. */
export function snapshotMediaKeys(snapshot: ReportSnapshot): readonly string[] {
  return snapshot.modules.flatMap((entry) => entry.media.map((media) => media.key));
}
