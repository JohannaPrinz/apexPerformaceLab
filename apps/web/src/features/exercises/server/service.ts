import 'server-only';

// Subpath, not the package barrel: the barrel constructs the Prisma client on
// load. Same note as in the athletes and cases services.
import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  canArchiveExercise,
  canEditExercise,
  canLinkVariants,
  canRemoveExercise,
  readExerciseMedia,
  scopeOf,
  variantPairKey,
  type ExerciseMedia,
  type ExerciseScope,
  type ExerciseUsage,
  type VariantLinkRefusal,
} from '@apex/domain';
import type { TenantContext } from '@apex/types';

import type { CreateExerciseInput, ListExercisesInput, UpdateExerciseInput } from '../schemas';

/**
 * The exercise catalogue.
 *
 * ## Reads are `this workspace OR system-wide`
 *
 * A system exercise carries `organizationId = null` and every workspace
 * inherits it. A strict `scoped()` filter would hide the whole system
 * catalogue, so reads use the same catalogue rule the measurement types use
 * (§12). **That is a tenant rule, not the absence of one** — the filter still
 * names this workspace, and no other workspace's rows can be reached.
 *
 * ## Writes are `scoped()` without exception
 *
 * Every mutation goes through `scoped()`, which pins `organizationId` to this
 * workspace and therefore *cannot match a system row* — its `organizationId` is
 * null. A system exercise is protected twice over: by the domain rule that says
 * so, and by a where clause that structurally cannot select it.
 */

type ExerciseDb = Pick<PrismaClientInstance, 'exercise' | 'measurement' | 'exerciseVariant'>;

const exerciseSelect = {
  id: true,
  key: true,
  name: true,
  canonicalName: true,
  description: true,
  instructions: true,
  primaryMuscles: true,
  secondaryMuscles: true,
  equipment: true,
  category: true,
  forceType: true,
  mechanic: true,
  difficulty: true,
  unilateral: true,
  media: true,
  source: true,
  sourceId: true,
  license: true,
  archivedAt: true,
  organizationId: true,
  createdByCoachId: true,
  createdAt: true,
} as const;

export interface ExerciseRecord {
  id: string;
  key: string;
  /** German display name. */
  name: string;
  /** Canonical English name. */
  canonicalName: string;
  description: string | null;
  instructions: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  category: string | null;
  forceType: string | null;
  mechanic: string | null;
  difficulty: string | null;
  unilateral: boolean;
  media: ExerciseMedia;
  /** Null on an exercise authored here rather than imported. */
  source: string | null;
  sourceId: string | null;
  license: string | null;
  archivedAt: Date | null;
  organizationId: string | null;
  createdByCoachId: string | null;
  createdAt: Date;
  /** Derived from `organizationId`, never stored twice. */
  scope: ExerciseScope;
  /** Whether this workspace may change it — false for every system exercise. */
  editable: boolean;
}

function toRecord(
  row: Omit<ExerciseRecord, 'scope' | 'editable' | 'media'> & { media: unknown },
): ExerciseRecord {
  const scope = scopeOf(row);

  return {
    ...row,
    // A malformed media list must not make the exercise unreadable — the
    // movement is still a movement without its picture.
    media: readExerciseMedia(row.media),
    scope,
    editable: canEditExercise(scope),
  };
}

/**
 * Turns a name into a stable key.
 *
 * Workspace keys only need to be unique within the workspace, so a collision is
 * resolved by suffixing rather than by refusing — a coach naming a second
 * variant of a movement should not have to think about identifiers at all.
 */
function toKey(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);

  return base === '' || !/^[a-z]/.test(base) ? `exercise_${Date.now().toString(36)}` : base;
}

/**
 * The catalogue a workspace can choose from.
 *
 * System and workspace exercises together, workspace first — a coach's own
 * definition is the more specific one and belongs at the top of the list.
 */
export async function listExercises(
  db: ExerciseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  input: ListExercisesInput,
): Promise<ExerciseRecord[]> {
  const { limit, offset } = input;

  const rows = await db.exercise.findMany({
    where: listWhere(tenant, input),
    select: exerciseSelect,
    orderBy: [{ organizationId: 'desc' }, { name: 'asc' }],
    ...(limit === undefined ? {} : { take: limit }),
    ...(offset === undefined ? {} : { skip: offset }),
  });

  return rows.map(toRecord);
}

/**
 * The `where` shared by the list and its count.
 *
 * One builder, so a page can never show "42 Treffer" above a list filtered
 * differently — the two would drift the first time a filter is added to only
 * one of them.
 */
function listWhere(
  tenant: Pick<TenantContext, 'organizationId'>,
  {
    search,
    includeArchived,
    category,
    difficulty,
    forceType,
    mechanic,
    unilateral,
    primaryMuscles,
    secondaryMuscles,
    equipment,
  }: ListExercisesInput,
) {
  /**
   * `hasEvery`, not `hasSome`: asking for chest *and* dumbbell means both.
   * A list filter with one entry behaves identically either way, so the
   * distinction only shows up where the coach narrowed deliberately.
   */
  const listFilters = [
    ...(primaryMuscles ? [{ primaryMuscles: { hasEvery: primaryMuscles } }] : []),
    ...(secondaryMuscles ? [{ secondaryMuscles: { hasEvery: secondaryMuscles } }] : []),
    ...(equipment ? [{ equipment: { hasEvery: equipment } }] : []),
  ];

  return {
    // **`AND` of two `OR`s, not two `OR` keys.** Prisma takes one `where`
    // object, so a second `OR` would replace the first — and the first is the
    // tenant filter. Spelling the conjunction out is what stops a search from
    // quietly widening the query to every workspace.
    AND: [
      { OR: [{ organizationId: tenant.organizationId }, { organizationId: null }] },
      // Both names: a coach may know the movement in German or by its
      // international term, and the catalogue answers to either.
      ...(search
        ? [
            {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { canonicalName: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          ]
        : []),
      ...listFilters,
    ],
    ...(category === undefined ? {} : { category }),
    ...(difficulty === undefined ? {} : { difficulty }),
    ...(forceType === undefined ? {} : { forceType }),
    ...(mechanic === undefined ? {} : { mechanic }),
    ...(unilateral === undefined ? {} : { unilateral }),
    ...(includeArchived ? {} : { archivedAt: null }),
  };
}

/**
 * How many exercises the same filters match, ignoring paging.
 *
 * Separate from `listExercises` rather than folded into its return: two other
 * pages read that list and would have to change shape for a number they do not
 * use. The `where` is built by the shared helper, so the count can never drift
 * from the list it describes.
 */
export async function countExercises(
  db: ExerciseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  input: ListExercisesInput,
): Promise<number> {
  return db.exercise.count({ where: listWhere(tenant, input) });
}

/** One exercise, from this workspace or the system catalogue. */
export async function getExercise(
  db: ExerciseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  exerciseId: string,
): Promise<ExerciseRecord | null> {
  const row = await db.exercise.findFirst({
    where: {
      id: exerciseId,
      OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
    },
    select: exerciseSelect,
  });

  return row ? toRecord(row) : null;
}

/**
 * The catalogue fields a workspace may write.
 *
 * `source`, `sourceId` and `license` are absent on purpose: they describe
 * *imported* data, and an exercise created here was authored here. The schema
 * omits them too, so a request cannot claim otherwise — this is the second
 * place that holds.
 */
function catalogueData(input: CreateExerciseInput) {
  return {
    name: input.name,
    canonicalName: input.canonicalName,
    description: input.description ?? null,
    instructions: input.instructions,
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles,
    equipment: input.equipment,
    category: input.category ?? null,
    forceType: input.forceType ?? null,
    mechanic: input.mechanic ?? null,
    difficulty: input.difficulty ?? null,
    unilateral: input.unilateral,
    media: input.media,
  };
}

export async function createExercise(
  db: ExerciseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  input: CreateExerciseInput,
): Promise<ExerciseRecord> {
  const created = await db.exercise.create({
    data: withTenant(tenant, {
      key: toKey(input.name),
      ...catalogueData(input),
      createdByCoachId,
    }),
    select: exerciseSelect,
  });

  return toRecord(created);
}

export type ExerciseWriteResult =
  { ok: true; exercise: ExerciseRecord } | { ok: false; reason: 'NOT_FOUND' };

/**
 * Edits a workspace's own exercise.
 *
 * `scoped()` cannot match a system exercise, so an attempt to edit one reports
 * `NOT_FOUND` — the same answer another workspace's row gets, and for the same
 * reason: a distinct refusal would confirm which ids exist (docs/SECURITY.md §4).
 */
export async function updateExercise(
  db: ExerciseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  { exerciseId, ...input }: UpdateExerciseInput,
): Promise<ExerciseWriteResult> {
  const { count } = await db.exercise.updateMany({
    where: scoped(tenant, { id: exerciseId }),
    // The key is not rewritten: it is the identity an import and a variant link
    // match on, and renaming a movement must not orphan either.
    data: catalogueData(input),
  });

  if (count === 0) return { ok: false, reason: 'NOT_FOUND' };

  const exercise = await getExercise(db, tenant, exerciseId);

  return exercise ? { ok: true, exercise } : { ok: false, reason: 'NOT_FOUND' };
}

/**
 * Archives or restores a workspace's own exercise.
 *
 * Archiving is what replaces deletion once an exercise has been used: it
 * disappears from selection and every past reference stays intact.
 */
export async function setExerciseArchived(
  db: ExerciseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  exerciseId: string,
  archived: boolean,
): Promise<ExerciseWriteResult> {
  const { count } = await db.exercise.updateMany({
    where: scoped(tenant, { id: exerciseId }),
    data: { archivedAt: archived ? new Date() : null },
  });

  if (count === 0) return { ok: false, reason: 'NOT_FOUND' };

  const exercise = await getExercise(db, tenant, exerciseId);

  return exercise ? { ok: true, exercise } : { ok: false, reason: 'NOT_FOUND' };
}

/**
 * Counts everywhere an exercise has been used.
 *
 * Only measurements can be non-zero today. The other three fields are named
 * because the rule is about *historical use*, not about the one table that
 * happens to reference the catalogue this month — and a caller that starts
 * passing them needs no change here.
 */
export async function exerciseUsage(
  db: ExerciseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  exerciseId: string,
): Promise<ExerciseUsage> {
  const measurements = await db.measurement.count({
    where: scoped(tenant, { exerciseId }),
  });

  return { measurements, programs: 0, recommendations: 0, reports: 0 };
}

export type ExerciseRemovalResult =
  { ok: true } | { ok: false; reason: 'NOT_FOUND' | 'SYSTEM_EXERCISE' | 'IN_USE' };

/**
 * Deletes an unused workspace exercise, or refuses and says why.
 *
 * The refusal is not the only line of defence: `Measurement.exerciseId` is
 * `onDelete: Restrict`, so an exercise with history cannot be deleted even by a
 * caller that never asks. This check exists to give a coach a sentence instead
 * of a foreign key violation.
 */
export async function removeExercise(
  db: ExerciseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  exerciseId: string,
): Promise<ExerciseRemovalResult> {
  const exercise = await getExercise(db, tenant, exerciseId);
  if (!exercise) return { ok: false, reason: 'NOT_FOUND' };

  const removal = canRemoveExercise(exercise.scope, await exerciseUsage(db, tenant, exerciseId));
  if (!removal.allowed) return { ok: false, reason: removal.reason };

  await db.exercise.deleteMany({ where: scoped(tenant, { id: exerciseId }) });

  return { ok: true };
}

/** Whether this workspace may archive the exercise — its own only. */
export function mayArchive(exercise: ExerciseRecord): boolean {
  return canArchiveExercise(exercise.scope);
}

// ── Variants ─────────────────────────────────────────────────────────────────

/**
 * The exercises linked as variations of this one.
 *
 * The relation is symmetric and stored once, with the smaller id first, so
 * "the variants of X" reads **both** columns. That is the price of not holding
 * the same fact twice, and it is paid here rather than by the caller.
 *
 * Links are filtered like the catalogue itself: system links are shared, and a
 * workspace sees only its own on top. A link another workspace wrote is
 * unreachable, and so is the exercise on its far side.
 */
export async function variantsOf(
  db: ExerciseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  exerciseId: string,
): Promise<RelatedExercise[]> {
  const links = await db.exerciseVariant.findMany({
    where: {
      OR: [{ exerciseId }, { variantId: exerciseId }],
      AND: [{ OR: [{ organizationId: tenant.organizationId }, { organizationId: null }] }],
    },
    select: { exerciseId: true, variantId: true, type: true },
  });

  const otherIds = links.map((link) =>
    link.exerciseId === exerciseId ? link.variantId : link.exerciseId,
  );

  /**
   * The kind of relationship, kept beside the exercise it points at.
   *
   * Reading the rows without their `type` was the defect this fixes: every
   * alternative would have reached the coach as merely related, and nothing in
   * the counts would have shown it.
   */
  const typeForId = new Map(
    links.map((link) => [
      link.exerciseId === exerciseId ? link.variantId : link.exerciseId,
      link.type,
    ]),
  );
  if (otherIds.length === 0) return [];

  const rows = await db.exercise.findMany({
    where: {
      id: { in: otherIds },
      OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
    },
    select: exerciseSelect,
    orderBy: { name: 'asc' },
  });

  return rows.map((row) => ({
    ...toRecord(row),
    // `related` only where the row somehow lost its link — never a silent
    // downgrade of an alternative, which is the failure this guards.
    relationship: typeForId.get(row.id) ?? 'related',
  }));
}

/** An exercise reached through a relationship, carrying the kind of it. */
export type RelatedExercise = ExerciseRecord & { readonly relationship: string };

export type VariantResult =
  { ok: true } | { ok: false; reason: 'NOT_FOUND' } | { ok: false; reason: VariantLinkRefusal };

/**
 * Links two exercises as variants of one another.
 *
 * Both must be readable in this workspace, and `canLinkVariants` decides the
 * rest: no self-link, never across workspaces, and a workspace may not link two
 * system exercises — that link would join the shared catalogue and every other
 * workspace would see it.
 *
 * The pair is stored once, ordered, which is also what the database CHECK
 * enforces. Writing it twice in opposite order is therefore impossible rather
 * than merely discouraged.
 */
export async function linkVariants(
  db: ExerciseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  exerciseId: string,
  variantId: string,
): Promise<VariantResult> {
  const [a, b] = await Promise.all([
    getExercise(db, tenant, exerciseId),
    getExercise(db, tenant, variantId),
  ]);

  if (!a || !b) return { ok: false, reason: 'NOT_FOUND' };

  const verdict = canLinkVariants(a, b, tenant.organizationId);
  if (!verdict.allowed) return { ok: false, reason: verdict.reason };

  const pair = variantPairKey(a.id, b.id);

  await db.exerciseVariant.upsert({
    where: { exerciseId_variantId: pair },
    // Already linked is not a failure: the pair is the fact, and it is present.
    update: {},
    create: { ...pair, organizationId: tenant.organizationId },
  });

  return { ok: true };
}

/** Removes a variant link. Only this workspace's own — a system link is shared. */
export async function unlinkVariants(
  db: ExerciseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  exerciseId: string,
  variantId: string,
): Promise<VariantResult> {
  const pair = variantPairKey(exerciseId, variantId);

  const { count } = await db.exerciseVariant.deleteMany({
    where: scoped(tenant, pair),
  });

  return count === 0 ? { ok: false, reason: 'NOT_FOUND' } : { ok: true };
}
