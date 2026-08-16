import { z } from 'zod';

import { exerciseMediaSchema } from './media';
import {
  difficultyVocabulary,
  equipmentVocabulary,
  exerciseCategoryVocabulary,
  forceTypeVocabulary,
  mechanicVocabulary,
  muscleVocabulary,
  vocabularyListSchema,
  vocabularySchema,
} from './taxonomy';

export * from './duplicates';
export * from './mapping';
export * from './media';
export * from './sources';
export * from './taxonomy';

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
 *
 * ## Two names, on purpose
 *
 * `name` is what a coach reads — German. `canonicalName` is the professional
 * English term the movement is known by internationally, and it is what an
 * import matches against and what a later English interface would show. They
 * are separate columns rather than one translated at render time because a
 * translation table for a catalogue nobody translates twice is machinery
 * without a load, and because the canonical name is *data about the movement*,
 * not a rendering of the German one.
 */

/** Nutrition is deliberately absent from this feature, in every direction. */

const nameSchema = z.string().trim().min(1).max(160);

export const exerciseSchema = z.object({
  /** Stable identifier. Unique among system exercises; never renamed once shipped. */
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'Use a lowercase identifier, e.g. "bench_press".')
    .max(80),
  /** German display name — what a coach reads. */
  name: nameSchema,
  /** Canonical English name — what an import matches against. */
  canonicalName: nameSchema,
  /** Prose: what the movement is and what it is for. */
  description: z.string().trim().max(4000).optional(),
  /**
   * How it is performed, as ordered steps.
   *
   * A list rather than one block of prose, because that is how instructions are
   * read and how a media item points at the step it illustrates.
   */
  instructions: z.array(z.string().trim().min(1).max(1000)).max(30).default([]),

  /** The muscles the movement is chiefly for. */
  primaryMuscles: vocabularyListSchema(muscleVocabulary).default([]),
  /** The muscles it also works. */
  secondaryMuscles: vocabularyListSchema(muscleVocabulary).default([]),
  /** What it is performed with. Empty means bodyweight or unclassified. */
  equipment: vocabularyListSchema(equipmentVocabulary, 10).default([]),

  category: vocabularySchema(exerciseCategoryVocabulary).optional(),
  forceType: vocabularySchema(forceTypeVocabulary).optional(),
  mechanic: vocabularySchema(mechanicVocabulary).optional(),
  difficulty: vocabularySchema(difficultyVocabulary).optional(),

  /**
   * Whether the movement is performed one side at a time.
   *
   * A property of the **movement**, and not the same thing as a module's
   * `recordsSide`. A unilateral movement usually calls for per-side recording,
   * but the decision to record that way belongs to the test: a coach may take a
   * single-leg press without distinguishing sides, and a bilateral movement may
   * still be measured per side on a force plate. The catalogue informs that
   * choice; it never makes it.
   */
  unilateral: z.boolean().default(false),

  media: exerciseMediaSchema.default([]),

  /**
   * Where imported data came from, and under what terms.
   *
   * Kept even though the specification drops `attribution` as a field: the
   * three below are what makes an import **traceable and lawful**. `source`
   * names the dataset, `sourceId` is that dataset's own identifier — which
   * makes a re-import idempotent instead of duplicating the catalogue — and
   * `license` records the terms the rows arrived under, so a later question
   * about redistribution has an answer in the data rather than in someone's
   * memory.
   *
   * All three are null for an exercise a coach typed in themselves. That is the
   * distinction they encode: authored here, or brought in from elsewhere.
   */
  source: z.string().trim().max(120).optional(),
  sourceId: z.string().trim().max(200).optional(),
  license: z.string().trim().max(200).optional(),
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

// ── Variants ─────────────────────────────────────────────────────────────────

/**
 * Variants are **peers**, not copies and not a hierarchy.
 *
 * Front squat, goblet squat and back squat are variations of one another with
 * no one of them the parent. The link is therefore symmetric and carries no
 * direction, and it is always a *reference*: a variant is a whole Exercise in
 * its own right, with its own muscles, equipment and media. Nothing is copied,
 * so correcting one never leaves the others stale.
 *
 * ## Stored once, read both ways
 *
 * A symmetric relation stored in both directions would hold the same fact
 * twice, which DOMAIN_RULES #15 forbids. One row per pair is stored instead,
 * with the smaller id first, and reads look at both columns. `variantPairKey`
 * below is the single place that ordering is decided.
 */
export function variantPairKey(a: string, b: string): { exerciseId: string; variantId: string } {
  return a < b ? { exerciseId: a, variantId: b } : { exerciseId: b, variantId: a };
}

export type VariantLinkRefusal =
  'SAME_EXERCISE' | 'ACROSS_WORKSPACES' | 'WOULD_EDIT_SYSTEM_CATALOGUE';

export type VariantLink = { allowed: true } | { allowed: false; reason: VariantLinkRefusal };

/**
 * Whether two exercises may be linked as variants of each other.
 *
 * Three refusals, each closing a hole rather than expressing a preference:
 *
 * 1. **An exercise is not a variant of itself.** A self-link would make "the
 *    variants of X" include X.
 * 2. **Never across workspaces.** Two workspaces' exercises must not reference
 *    one another; the link would leak the existence of a row a tenant cannot
 *    read.
 * 3. **A workspace may not link two system exercises.** That link would be part
 *    of the shared catalogue and every other workspace would see it — a coach
 *    editing the system catalogue by the back door. A workspace may link *its
 *    own* exercise to a system one; that link belongs to the workspace and is
 *    visible only there.
 *
 * `linkOwner` is the workspace the link belongs to, or null for a system link
 * written by the seed.
 */
export function canLinkVariants(
  a: { id: string; organizationId: string | null },
  b: { id: string; organizationId: string | null },
  linkOwner: string | null,
): VariantLink {
  if (a.id === b.id) return { allowed: false, reason: 'SAME_EXERCISE' };

  const owners = [a.organizationId, b.organizationId].filter((id): id is string => id !== null);

  // Both belong to a workspace, and not the same one.
  if (owners.length === 2 && owners[0] !== owners[1]) {
    return { allowed: false, reason: 'ACROSS_WORKSPACES' };
  }

  // Either exercise belongs to a workspace other than the one writing the link.
  if (owners.some((id) => id !== linkOwner)) {
    return { allowed: false, reason: 'ACROSS_WORKSPACES' };
  }

  // A workspace link must involve at least one of that workspace's own
  // exercises; otherwise it is an edit to the shared catalogue.
  if (linkOwner !== null && owners.length === 0) {
    return { allowed: false, reason: 'WOULD_EDIT_SYSTEM_CATALOGUE' };
  }

  return { allowed: true };
}

export function describeVariantRefusal(reason: VariantLinkRefusal): string {
  switch (reason) {
    case 'SAME_EXERCISE':
      return 'An exercise cannot be a variant of itself.';
    case 'ACROSS_WORKSPACES':
      return 'That exercise is not available in this workspace.';
    case 'WOULD_EDIT_SYSTEM_CATALOGUE':
      return 'Both of those are system exercises, and the system catalogue is shared by every workspace. Link one of your own exercises instead.';
  }
}

// ── The system catalogue ─────────────────────────────────────────────────────

/**
 * The exercises the platform ships.
 *
 * Six today — enough to verify the structure end to end. The full catalogue of
 * several hundred arrives by import, from a source that also fixes the muscle,
 * equipment and category vocabularies; see `taxonomy.ts`.
 *
 * German names and English canonical names, both as the specification wrote
 * them. Nothing here is classified yet: with three vocabularies still empty,
 * claiming a category or a muscle would be inventing the very thing the import
 * is meant to supply.
 */
export interface SystemExercise {
  readonly key: string;
  readonly name: string;
  readonly canonicalName: string;
  readonly unilateral?: boolean;
}

export const SYSTEM_EXERCISES = [
  { key: 'bench_press', name: 'Bankdrücken', canonicalName: 'Bench Press' },
  { key: 'squat', name: 'Kniebeuge', canonicalName: 'Squat' },
  { key: 'deadlift', name: 'Kreuzheben', canonicalName: 'Deadlift' },
  { key: 'overhead_press', name: 'Schulterdrücken', canonicalName: 'Overhead Press' },
  { key: 'pull_up', name: 'Klimmzug', canonicalName: 'Pull-up' },
  { key: 'leg_press', name: 'Beinpresse', canonicalName: 'Leg Press' },
] as const satisfies readonly SystemExercise[];

export type SystemExerciseKey = (typeof SYSTEM_EXERCISES)[number]['key'];

export function findSystemExercise(key: string): SystemExercise | undefined {
  return SYSTEM_EXERCISES.find((exercise) => exercise.key === key);
}

// ── Deleting versus archiving ────────────────────────────────────────────────

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
