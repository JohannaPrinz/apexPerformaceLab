import { z } from 'zod';

/**
 * Where a file lives, and for how long.
 *
 * ## Three areas, one bucket
 *
 * ```
 * analysis-temp/<organizationId>/<testId>/…   temporary — swept after 14 days
 * reports/<reportId>/…                        frozen with a published analysis
 * athletes/<athleteId>/…                      the athlete's own media
 * ```
 *
 * The path *is* the lifetime. A file under `analysis-temp/` is working material
 * of one analysis screen and nothing is entitled to it; a file under `reports/`
 * belongs to a document somebody has been handed and outlives the analysis that
 * produced it; a file under `athletes/` is the athlete's, and neither of the
 * other two may quietly become it.
 *
 * ## Why publishing copies rather than moves
 *
 * §16 freezes a report. A document whose pictures sit in a folder something else
 * may empty is not frozen — so publication copies the chosen stills into the
 * report's own folder and only then clears the temporary ones. A failure between
 * the two leaves a temporary file, which the sweep removes.
 *
 * ## Why each area is checked differently
 *
 * A path carries what a check needs, and no more. The temporary area names the
 * workspace, so a string comparison settles it. A report folder names only the
 * report: whether the caller may read it is a question about *that report* — the
 * workspace that owns it, or the share link that opens it — and the routes ask
 * it that way. The athlete area names the athlete, and visibility of an athlete
 * is already decided (§7).
 */

/** Temporary working files of a video analysis. */
export const ANALYSIS_PREFIX = 'analysis-temp';

/** Files frozen into a published analysis. */
export const REPORT_MEDIA_PREFIX = 'reports';

/** The athlete's own, permanent media. */
export const ATHLETE_MEDIA_PREFIX = 'athletes';

/** How long an abandoned analysis keeps its working files. */
export const ANALYSIS_TEMP_DAYS = 14;

/** A still, as a video frame. JPEG: these are photographs, not diagrams. */
export const STILL_CONTENT_TYPE = 'image/jpeg';
export const STILL_EXTENSION = 'jpg';

/** As many stills as one test may carry. A bound the browser cannot exceed. */
export const MAX_STILLS_PER_MODULE = 12;

/** Ids and positions are restricted so a key can never escape its prefix. */
const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
const positionPattern = /^[a-z0-9_]{1,40}$/;

const safeId = z.string().regex(idPattern);

/** What a temporary still is: which test it came from, and which moment it shows. */
export interface AnalysisStill {
  readonly organizationId: string;
  readonly moduleId: string;
  /** The profile position it was taken at — `flexed`, `extended`, … */
  readonly position: string;
  /** Random, so keys cannot be enumerated by guessing positions. */
  readonly stillId: string;
}

/**
 * The storage key for a temporary still.
 *
 * Throws on anything that would not round-trip. A key is a security boundary
 * here, and building one out of unvalidated input is how a path escapes its
 * prefix — better to fail at the call site than to write a file somewhere
 * nobody will look for it again.
 */
export function analysisStillKey(still: AnalysisStill): string {
  if (
    !idPattern.test(still.organizationId) ||
    !idPattern.test(still.moduleId) ||
    !idPattern.test(still.stillId) ||
    !positionPattern.test(still.position)
  ) {
    throw new Error('Ungültiger Bezeichner für ein Standbild.');
  }

  return `${ANALYSIS_PREFIX}/${still.organizationId}/${still.moduleId}/${still.position}__${still.stillId}.${STILL_EXTENSION}`;
}

/** Everything under one test, for listing and for clearing up. */
export function analysisStillFolder(organizationId: string, moduleId: string): string {
  if (!idPattern.test(organizationId) || !idPattern.test(moduleId)) {
    throw new Error('Ungültiger Bezeichner für ein Standbild.');
  }

  return `${ANALYSIS_PREFIX}/${organizationId}/${moduleId}`;
}

/** Everything a workspace has left in the temporary area. What the sweep walks. */
export function analysisWorkspaceFolder(organizationId: string): string {
  if (!idPattern.test(organizationId)) throw new Error('Ungültiger Bezeichner.');

  return `${ANALYSIS_PREFIX}/${organizationId}`;
}

/** Reads a key back. `null` for anything this code did not write. */
export function parseAnalysisStillKey(key: string): AnalysisStill | null {
  const parts = key.split('/');
  if (parts.length !== 4 || parts[0] !== ANALYSIS_PREFIX) return null;

  const [, organizationId = '', moduleId = '', file = ''] = parts;
  const suffix = `.${STILL_EXTENSION}`;
  if (!file.endsWith(suffix)) return null;

  const [position = '', stillId = '', ...rest] = file.slice(0, -suffix.length).split('__');
  if (rest.length > 0) return null;

  if (
    !idPattern.test(organizationId) ||
    !idPattern.test(moduleId) ||
    !idPattern.test(stillId) ||
    !positionPattern.test(position)
  ) {
    return null;
  }

  return { organizationId, moduleId, position, stillId };
}

/** The storage key for a still that a published analysis owns. */
export function reportMediaKey(reportId: string, mediaId: string): string {
  if (!idPattern.test(reportId) || !idPattern.test(mediaId)) {
    throw new Error('Ungültiger Bezeichner für ein Report-Medium.');
  }

  return `${REPORT_MEDIA_PREFIX}/${reportId}/${mediaId}.${STILL_EXTENSION}`;
}

/** Everything a published analysis owns. What deleting the report must remove. */
export function reportMediaFolder(reportId: string): string {
  if (!idPattern.test(reportId)) throw new Error('Ungültiger Bezeichner für ein Report-Medium.');

  return `${REPORT_MEDIA_PREFIX}/${reportId}`;
}

/** The report a key belongs to, or `null` where it is not a report key. */
export function reportOfKey(key: string): string | null {
  const parts = key.split('/');
  if (parts.length !== 3 || parts[0] !== REPORT_MEDIA_PREFIX) return null;

  const [, reportId = ''] = parts;

  return idPattern.test(reportId) ? reportId : null;
}

/** Everything one athlete has. Their own media, kept apart from the two above. */
export function athleteMediaFolder(athleteId: string): string {
  if (!idPattern.test(athleteId)) throw new Error('Ungültiger Bezeichner für eine Athletendatei.');

  return `${ATHLETE_MEDIA_PREFIX}/${athleteId}`;
}

/** The athlete a key belongs to, or `null` where it is not an athlete key. */
export function athleteOfKey(key: string): string | null {
  const parts = key.split('/');
  if (parts.length < 3 || parts[0] !== ATHLETE_MEDIA_PREFIX) return null;

  const [, athleteId = ''] = parts;

  return idPattern.test(athleteId) ? athleteId : null;
}

/**
 * Whether a temporary key belongs to this workspace.
 *
 * The single check the serving route makes for that area before touching the
 * store. A string comparison on purpose: it cannot be defeated by a missing
 * await, a mocked client or a store answering for the wrong bucket.
 */
export function analysisKeyBelongsToOrganization(key: string, organizationId: string): boolean {
  if (!idPattern.test(organizationId)) return false;

  return key.startsWith(`${ANALYSIS_PREFIX}/${organizationId}/`);
}

/**
 * One still as a published analysis carries it.
 *
 * The label is frozen with it rather than looked up later: it comes from the
 * movement profile, and a profile may be renamed or retired. A document that
 * needed today's catalogue to caption its own pictures would not be frozen.
 */
export const reportMediaSchema = z.object({
  id: safeId,
  /** The storage key, as written at publication. Never rebuilt from parts. */
  key: z.string().min(1).max(300),
  /** What the picture shows, in the coach's language. */
  label: z.string().min(1).max(200),
  /** Which test it belongs to, so it renders beside the right numbers. */
  moduleId: safeId,
});

export type ReportMedia = z.infer<typeof reportMediaSchema>;
