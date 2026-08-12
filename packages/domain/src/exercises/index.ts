import { z } from 'zod';

/**
 * The exercise catalogue.
 *
 * An Exercise is a **movement** — bench press, squat, deadlift. It is a domain
 * resource in its own right, deliberately general rather than a
 * `StrengthExercise`: the same catalogue is meant to serve training plans,
 * recommendations, reports and assessments as those arrive, and a catalogue
 * built for one of them would have to be rebuilt for the next.
 *
 * ## An Exercise is not a Measurement Type
 *
 * This is the distinction the whole design rests on:
 *
 * - **`Maximal strength`** describes *what is measured* — the test, the
 *   quantity, the unit. That is a Measurement Type.
 * - **`Bench press`** describes *what was done* — the movement the values were
 *   taken during. That is an Exercise.
 *
 * A maximal-strength test of the bench press records a load and a repetition
 * count; the exercise is the context those two numbers need in order to mean
 * anything. Folding the exercise into the type would produce one type per
 * movement per quantity, and the catalogue would grow multiplicatively while
 * saying nothing new.
 *
 * ## An Exercise is not a Module either
 *
 * A Module is a test inside an Assessment (§11). An Exercise is what that test
 * covers, declared in the module's configuration as `exerciseIds` and recorded
 * on each Measurement. A lactate step test carries no exercise at all, and an
 * empty list says that plainly.
 *
 * ## System and workspace exercises
 *
 * Exactly the `MeasurementType` pattern (§12): a row with a null
 * `organizationId` is a system exercise that every workspace inherits and none
 * may edit; a row with one belongs to that workspace alone. Reads are
 * `this workspace OR system-wide`, which is the tenant rule for a catalogue
 * rather than an absence of one.
 */

/**
 * Muscle groups are free text.
 *
 * Deliberately not an enum. Naming the muscle groups of the human body in a
 * fixed list is a professional decision that has not been taken, and the same
 * restraint applies here as to reference ranges and dimension vocabularies: an
 * invented taxonomy in a platform that calls itself scientific is worse than an
 * open field. A controlled vocabulary can be layered on later without a
 * migration, because the column is already a list of strings.
 */
export const muscleGroupSchema = z.string().trim().min(1).max(80);

export const exerciseSchema = z.object({
  /** Stable identifier. Unique among system exercises; never renamed once shipped. */
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'Use a lowercase identifier, e.g. "bench_press".')
    .max(60),
  name: z.string().trim().min(1).max(120),
  /** How the movement is performed. */
  description: z.string().trim().max(4000).optional(),
  muscleGroups: z.array(muscleGroupSchema).max(20).default([]),
});

export type ExerciseInput = z.infer<typeof exerciseSchema>;

/**
 * Where an exercise comes from.
 *
 * Derived from `organizationId`, never stored a second time — the null tells
 * the whole story, and a `scope` column would be a field that can disagree with
 * it.
 */
export type ExerciseScope = 'SYSTEM' | 'WORKSPACE';

export function scopeOf(exercise: { organizationId: string | null }): ExerciseScope {
  return exercise.organizationId === null ? 'SYSTEM' : 'WORKSPACE';
}

/**
 * The system catalogue.
 *
 * Lives here rather than in a seed file for the same reason the measurement
 * types do: which movements the platform ships is a domain decision under
 * review in one diff, not data. The seed reads from here.
 *
 * **Exactly the movements that were specified, and no more.** Extending this
 * list is a professional decision; a plausible-looking addition is still an
 * invention. Descriptions and muscle groups are left to be filled in for the
 * same reason — writing execution instructions would be authoring coaching
 * content, not building a catalogue.
 */
export interface SystemExercise {
  readonly key: string;
  readonly name: string;
}

export const SYSTEM_EXERCISES = [
  { key: 'bench_press', name: 'Bench Press' },
  { key: 'squat', name: 'Squat' },
  { key: 'deadlift', name: 'Deadlift' },
  { key: 'overhead_press', name: 'Overhead Press' },
  { key: 'pull_up', name: 'Pull-up' },
  { key: 'leg_press', name: 'Leg Press' },
] as const satisfies readonly SystemExercise[];

export type SystemExerciseKey = (typeof SYSTEM_EXERCISES)[number]['key'];

export function findSystemExercise(key: string): SystemExercise | undefined {
  return SYSTEM_EXERCISES.find((exercise) => exercise.key === key);
}

/**
 * Everywhere an exercise may already have been used.
 *
 * Counted by the caller from whatever references exist at the time. Today only
 * `measurements` can be non-zero; the other three are named because the rule is
 * about *historical use*, not about the one table that happens to reference the
 * catalogue this month — and a field that appears when the feature does would
 * be a rule quietly changing under the reader.
 */
export interface ExerciseUsage {
  readonly measurements: number;
  readonly programs: number;
  readonly recommendations: number;
  readonly reports: number;
}

export const NO_EXERCISE_USAGE: ExerciseUsage = {
  measurements: 0,
  programs: 0,
  recommendations: 0,
  reports: 0,
};

export function isUsed(usage: ExerciseUsage): boolean {
  return (
    usage.measurements > 0 || usage.programs > 0 || usage.recommendations > 0 || usage.reports > 0
  );
}

export type ExerciseRemoval =
  | { readonly allowed: true; readonly action: 'DELETE' }
  | { readonly allowed: false; readonly reason: 'SYSTEM_EXERCISE' | 'IN_USE' };

/**
 * Whether an exercise may be deleted outright, or must be archived instead.
 *
 * Three rules, in the order they decide:
 *
 * 1. **A system exercise is never deleted.** It is shared by every workspace,
 *    so one workspace's decision cannot be allowed to reach into the others.
 *    Archiving it is not a workspace's call either — see `canArchive`.
 * 2. **An exercise that has been used is never deleted.** Not because deletion
 *    is technically hard, but because the use is history: a measurement taken
 *    during a bench press does not stop having been taken. It is archived, which
 *    removes it from selection while leaving every past reference intact.
 * 3. **An unused workspace exercise may be deleted.** There is nothing to
 *    preserve, and leaving it behind would clutter the catalogue with a mistake.
 *
 * Rule 2 is additionally enforced by the database: the Measurement → Exercise
 * foreign key is `Restrict`, so history survives even a caller that never asks
 * this function.
 */
export function canRemoveExercise(scope: ExerciseScope, usage: ExerciseUsage): ExerciseRemoval {
  if (scope === 'SYSTEM') return { allowed: false, reason: 'SYSTEM_EXERCISE' };
  if (isUsed(usage)) return { allowed: false, reason: 'IN_USE' };

  return { allowed: true, action: 'DELETE' };
}

/**
 * Whether a workspace may archive an exercise.
 *
 * Only its own. Archiving a system exercise would hide it for everyone, and a
 * per-workspace hidden list is a preference feature, not a catalogue rule — it
 * has not been asked for and is not invented here.
 *
 * Archiving is always available for a workspace's own exercise, used or not:
 * that is the whole point of having it alongside deletion.
 */
export function canArchiveExercise(scope: ExerciseScope): boolean {
  return scope === 'WORKSPACE';
}

/** Whether a workspace may edit an exercise. Its own only — never a system one. */
export function canEditExercise(scope: ExerciseScope): boolean {
  return scope === 'WORKSPACE';
}

/** A message that names what is in the way rather than that something is. */
export function describeRemovalRefusal(reason: 'SYSTEM_EXERCISE' | 'IN_USE'): string {
  return reason === 'SYSTEM_EXERCISE'
    ? 'This is a system exercise and belongs to every workspace, so it cannot be deleted here.'
    : 'This exercise has already been used and is part of the record. Archive it instead — it disappears from selection and everything recorded with it stays intact.';
}
