import {
  describeImportProblem,
  exerciseImportSchema,
  planExerciseImport,
  variantPairKey,
  type DuplicateCandidate,
  type ExerciseImportPlan,
} from '@apex/domain';

import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Writing a validated catalogue into the database.
 *
 * The planning, the vocabularies, the licence check and the duplicate detection
 * all live in `@apex/domain`, where they are testable without a database. This
 * module does one thing: apply a plan.
 *
 * ## Idempotent by key
 *
 * An exercise is matched on `(organizationId, key)`. Running the same file twice
 * updates the rows rather than adding a second copy, and running a corrected
 * file applies the correction. That is what makes an import safe to repeat —
 * and it has to be, because a catalogue of several hundred rows will be
 * imported many times before it is right.
 *
 * The **key is never rewritten.** It is the identity a variant link and a
 * re-import both match on, and renaming a movement must not orphan either.
 *
 * ## Two passes, because variants are references
 *
 * Exercises first, links second. A variant names another exercise by key, and
 * keys become ids only once the rows exist. Doing it in one pass would mean
 * ordering the file so that no exercise ever precedes its variant — a
 * requirement no author should have to think about.
 *
 * ## Nothing is deleted
 *
 * An exercise absent from a later file is left alone, not removed. A catalogue
 * import is not a synchronisation: the row may be in use, and use is history
 * (§12a). Removing one is a separate, deliberate act with its own rules.
 */

export interface ImportOptions {
  /** Null writes system exercises — the shared catalogue. */
  readonly organizationId?: string | null;
  /** Required when writing into a workspace; system rows have no author. */
  readonly createdByCoachId?: string | null;
  /** Report what would happen and write nothing. */
  readonly dryRun?: boolean;
}

export interface ImportResult {
  readonly plan: ExerciseImportPlan;
  readonly created: number;
  readonly updated: number;
  readonly variantsLinked: number;
  readonly duplicates: readonly DuplicateCandidate[];
  readonly problems: readonly string[];
  readonly written: boolean;
}

type ImportDb = Pick<PrismaClient, 'exercise' | 'exerciseVariant'>;

/**
 * Reads, validates, plans and applies a catalogue file.
 *
 * Returns without writing when the plan is not writable — an unapproved source,
 * a missing licence, a variant pointing nowhere, a repeated source row. The
 * caller gets every reason at once rather than one per attempt.
 */
export async function importExercises(
  db: ImportDb,
  file: unknown,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const organizationId = options.organizationId ?? null;
  const createdByCoachId = options.createdByCoachId ?? null;

  const parsed = exerciseImportSchema.parse(file);

  // Compared against what this scope already holds, so a second run recognises
  // its own rows instead of reporting the whole file as duplicated.
  const existing = await db.exercise.findMany({
    where: { organizationId },
    select: { key: true, name: true, canonicalName: true, source: true, sourceId: true },
  });

  const plan = planExerciseImport(
    parsed,
    existing.map((row) => ({
      key: row.key,
      name: row.name,
      canonicalName: row.canonicalName,
      source: row.source ?? undefined,
      sourceId: row.sourceId ?? undefined,
    })),
  );

  const problems = plan.problems.map(describeImportProblem);

  if (!plan.writable || options.dryRun === true) {
    return {
      plan,
      created: 0,
      updated: 0,
      variantsLinked: 0,
      duplicates: plan.duplicates,
      problems,
      written: false,
    };
  }

  const existingKeys = new Set(existing.map((row) => row.key));
  let created = 0;
  let updated = 0;

  // ── Pass one: the exercises ────────────────────────────────────────────────
  for (const entry of plan.entries) {
    const data = {
      name: entry.name,
      canonicalName: entry.canonicalName,
      description: entry.description ?? null,
      instructions: entry.instructions,
      primaryMuscles: entry.primaryMuscles,
      secondaryMuscles: entry.secondaryMuscles,
      equipment: entry.equipment,
      category: entry.category ?? null,
      forceType: entry.forceType ?? null,
      mechanic: entry.mechanic ?? null,
      difficulty: entry.difficulty ?? null,
      unilateral: entry.unilateral,
      media: entry.media,
      source: entry.source ?? null,
      sourceId: entry.sourceId ?? null,
      license: entry.license ?? null,
    };

    if (existingKeys.has(entry.key)) {
      // `updateMany` rather than `update`: the match is on the pair
      // (organizationId, key), and a unique `where` cannot carry a null
      // organization for the system catalogue.
      await db.exercise.updateMany({ where: { organizationId, key: entry.key }, data });
      updated++;
    } else {
      await db.exercise.create({
        data: { ...data, key: entry.key, organizationId, createdByCoachId },
      });
      created++;
    }
  }

  // ── Pass two: the variant links ────────────────────────────────────────────
  const rows = await db.exercise.findMany({
    where: { organizationId, key: { in: plan.entries.map((entry) => entry.key) } },
    select: { id: true, key: true },
  });
  const idForKey = new Map(rows.map((row) => [row.key, row.id]));

  let variantsLinked = 0;
  for (const pair of plan.variantPairs) {
    const a = idForKey.get(pair.a);
    const b = idForKey.get(pair.b);
    if (!a || !b) continue;

    const ordered = variantPairKey(a, b);

    await db.exerciseVariant.upsert({
      where: { exerciseId_variantId: ordered },
      // Already linked is not a failure — but the *type* is corrected. An empty
      // update would preserve a wrong kind forever, and a re-import is how a
      // correction reaches the database.
      update: { type: pair.type },
      create: { ...ordered, organizationId, type: pair.type },
    });
    variantsLinked++;
  }

  return {
    plan,
    created,
    updated,
    variantsLinked,
    duplicates: plan.duplicates,
    problems,
    written: true,
  };
}
