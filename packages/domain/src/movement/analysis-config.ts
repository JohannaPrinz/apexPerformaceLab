import { z } from 'zod';

import { movementProfile, type MovementProfile, type SuggestedTarget } from './profile';

/**
 * What the coach decided for **one test** — which angles matter and what, if
 * anything, they are aiming for.
 *
 * ## Why this is not part of the profile
 *
 * The profile says what a squat *is*; this says what this coach wants to look
 * at this time. Two tests of the same exercise may legitimately track different
 * angles and aim at different numbers — a return-to-sport screen and a strength
 * session are not the same question. Storing either in the profile would make
 * one test's decision silently change another's.
 *
 * ## Why it lives in the module payload
 *
 * `AssessmentModule.payload` already carries the test's configuration and is
 * already versioned and validated. A table for four fields that only ever exist
 * alongside a module would add a join to every read of a test for nothing.
 *
 * ## Backwards compatibility is the point of every default here
 *
 * A test configured before this existed has no `movement` block at all. That
 * must keep working exactly as it did, so every field has a default and an
 * absent block means "no movement configuration", never "an empty one". The
 * schema is `.optional()` end to end for that reason.
 */

export const TARGET_COMPARISON_KEYS = ['at_most', 'at_least', 'equals'] as const;
export type TargetComparisonKey = (typeof TARGET_COMPARISON_KEYS)[number];

export const TARGET_COMPARISON_LABELS_DE: Readonly<Record<TargetComparisonKey, string>> = {
  at_most: 'höchstens',
  at_least: 'mindestens',
  equals: 'genau',
};

/** The mathematical symbol, for a table cell where the word would not fit. */
export const TARGET_COMPARISON_SYMBOLS: Readonly<Record<TargetComparisonKey, string>> = {
  at_most: '≤',
  at_least: '≥',
  equals: '=',
};

/**
 * How close counts as equal.
 *
 * `equals` on a pose estimate would otherwise never be satisfied — the model
 * jitters by more than a degree between frames, so demanding exactly 90.0°
 * demands a coincidence. One degree either way is the tolerance the measurement
 * itself supports; anything tighter would be reporting precision that is not
 * there.
 */
export const EQUALS_TOLERANCE_DEGREES = 1;

export const angleTargetSchema = z.object({
  /** The track this target speaks about, e.g. `knee`. */
  track: z.string().min(1).max(40),
  /** Which end of the movement, e.g. `flexed`. */
  position: z.string().min(1).max(40),
  comparison: z.enum(TARGET_COMPARISON_KEYS),
  degrees: z.number().min(0).max(360),
});

export type AngleTargetConfig = z.infer<typeof angleTargetSchema>;

/**
 * What the analysis actually measured, kept so the report can draw it.
 *
 * ## Why the curve is stored and the numbers are not recomputed
 *
 * The angles already become Measurements. What never survived the screen was the
 * *shape* of the movement — the driving angle over time and where each
 * repetition began and ended — and without it a report can only list aggregates.
 * Everything a movement profile needs beyond the aggregates (the course, the
 * tempo per repetition, whether the athlete slowed down over the set) is derived
 * from these two arrays, so storing them adds no second truth: they are the raw
 * material the aggregates already came from.
 *
 * ## Why it is bounded
 *
 * A minute at 30 fps is 1800 samples. The cap is generous enough for the clips
 * this is for and low enough that a module payload stays a payload.
 */
export const movementResultSchema = z.object({
  durationMs: z.number().int().min(0).max(3_600_000),
  repetitions: z.number().int().min(0).max(500),
  reps: z
    .array(
      z.object({
        index: z.number().int().min(0),
        startedAtMs: z.number().min(0),
        endedAtMs: z.number().min(0),
        durationMs: z.number().min(0),
      }),
    )
    .max(500),
  /** The driving angle over time. `v` is null where the model saw nobody. */
  signal: z.array(z.object({ t: z.number().min(0), v: z.number().nullable() })).max(4000),
});

export type MovementResultPayload = z.infer<typeof movementResultSchema>;

export const movementAnalysisConfigSchema = z.object({
  /** Which profile the values were measured under. */
  profileKey: z.string().min(1).max(40),
  /**
   * The tracks the coach kept.
   *
   * Absent means "every track the profile offers" — the default a coach gets
   * before they touch anything, and what an older configuration implies.
   */
  tracks: z.array(z.string().min(1).max(40)).optional(),
  /** Targets the coach set. Never populated from the profile without a choice. */
  targets: z.array(angleTargetSchema).default([]),
  /**
   * What the run measured.
   *
   * Optional: written the first time an analysis is saved from a screen that
   * knows how, and absent on every analysis stored before that — which is the
   * truth about them, not a gap to fill in.
   */
  result: movementResultSchema.optional(),
});

export type MovementAnalysisConfig = z.infer<typeof movementAnalysisConfigSchema>;

/**
 * The tracks a configuration actually covers.
 *
 * Defaults to all of them, and **filters against the profile**: a stored track
 * key that the profile no longer defines is dropped rather than carried, so
 * renaming or retiring a track cannot produce a column nothing can fill.
 */
export function selectedTracks(
  profile: MovementProfile,
  config: MovementAnalysisConfig | null | undefined,
): readonly string[] {
  const all = profile.tracks.map((track) => track.key);
  if (config?.tracks === undefined) return all;

  return all.filter((key) => config.tracks?.includes(key) === true);
}

/**
 * The targets that apply, ignoring any whose track the coach dropped.
 *
 * A target on a deselected angle must not surface: the coach said that angle is
 * not relevant here, and a "Ziel nicht erreicht" for something nobody chose to
 * measure would be noise reported as a finding.
 */
export function activeTargets(
  profile: MovementProfile,
  config: MovementAnalysisConfig | null | undefined,
): readonly AngleTargetConfig[] {
  if (!config) return [];

  const tracks = new Set(selectedTracks(profile, config));

  return config.targets.filter(
    (target) =>
      tracks.has(target.track) && profile.positions.some((p) => p.key === target.position),
  );
}

/**
 * The configuration a coach starts from: every angle, no targets applied.
 *
 * The profile's suggestions are **offered separately** (`suggestedTargetsFor`),
 * not folded in here. A suggestion that arrived already applied would be the
 * platform setting a criterion and the coach discovering it afterwards.
 */
export function defaultAnalysisConfig(profile: MovementProfile): MovementAnalysisConfig {
  return {
    profileKey: profile.key,
    tracks: profile.tracks.map((track) => track.key),
    targets: [],
  };
}

/** What the profile proposes, for the interface to offer. */
export function suggestedTargetsFor(profile: MovementProfile): readonly SuggestedTarget[] {
  return profile.suggestedTargets;
}

/**
 * Reads a movement configuration out of a module payload.
 *
 * Returns `null` for anything it does not recognise — an older test, a payload
 * written by a future version, a malformed block. `null` means "this test has no
 * movement configuration", which every caller already has to handle because it
 * is the state every existing test is in.
 */
export function readMovementConfig(payload: unknown): MovementAnalysisConfig | null {
  if (payload === null || typeof payload !== 'object') return null;

  const block = (payload as { movement?: unknown }).movement;
  if (block === undefined) return null;

  const parsed = movementAnalysisConfigSchema.safeParse(block);
  if (!parsed.success) return null;

  // A configuration naming a profile nobody ships is not usable, and guessing a
  // replacement would analyse one movement as another.
  return movementProfile(parsed.data.profileKey) === null ? null : parsed.data;
}

/** Whether one measured angle satisfies a target. */
export function meetsTarget(degrees: number, target: AngleTargetConfig): boolean {
  if (target.comparison === 'at_most') return degrees <= target.degrees;
  if (target.comparison === 'at_least') return degrees >= target.degrees;

  return Math.abs(degrees - target.degrees) <= EQUALS_TOLERANCE_DEGREES;
}
