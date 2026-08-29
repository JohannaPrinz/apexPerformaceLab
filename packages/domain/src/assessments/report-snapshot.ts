import { z } from 'zod';

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
 * ## Why it is versioned and refused rather than half-read
 *
 * The same discipline as the draft and the module configuration: a payload
 * written by a shape this code does not know is refused outright. A document
 * that is half understood is worse than one that will not open, because only
 * the second is obvious.
 *
 * ## Dates
 *
 * Stored as ISO strings, because JSON has no date. They are parsed back on
 * read; nothing downstream sees a string where it expects a moment.
 */

export const REPORT_SNAPSHOT_VERSION = 1;

const pointSchema = z.object({ value: z.number(), capturedAt: z.string() });

const seriesSchema = z.object({
  key: z.string(),
  typeName: z.string(),
  unit: z.string(),
  side: z.string(),
  exerciseName: z.string().nullable(),
  passIndex: z.number().int().nullable(),
  context: z.record(z.string(), z.string()),
  source: z.string(),
  current: pointSchema,
  previous: pointSchema.nullable(),
  difference: z.number().nullable(),
  best: pointSchema.nullable(),
});

const moduleSchema = z.object({
  moduleId: z.string(),
  name: z.string(),
  typeLabel: z.string(),
  protocolLabel: z.string().nullable(),
  derivations: z.array(z.string()),
  series: z.array(seriesSchema),
  interpretation: z.string(),
  recommendation: z.string(),
});

export const reportSnapshotSchema = z.object({
  version: z.literal(REPORT_SNAPSHOT_VERSION),
  /** When it was frozen. The document's own date, not the assessment's. */
  publishedAt: z.string(),
  assessment: z.object({ performedAt: z.string() }),
  athlete: z.object({ firstName: z.string(), lastName: z.string() }),
  coach: z.object({ name: z.string() }),
  modules: z.array(moduleSchema),
  overall: z.object({ interpretation: z.string(), recommendation: z.string() }),
});

export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;
export type SnapshotModule = z.infer<typeof moduleSchema>;
export type SnapshotSeries = z.infer<typeof seriesSchema>;

/** Reads a stored snapshot, or `null` where there is none or it is unreadable. */
export function readReportSnapshot(payload: unknown): ReportSnapshot | null {
  const parsed = reportSnapshotSchema.safeParse(payload);

  return parsed.success ? parsed.data : null;
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
  return snapshot.modules.every((entry) => entry.series.length === 0);
}
