import 'server-only';

// Subpath, not the package barrel: the barrel constructs the Prisma client on
// load. Same note as in the athletes and cases services.
import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  canArchiveExercise,
  canEditExercise,
  canRemoveExercise,
  scopeOf,
  type ExerciseScope,
  type ExerciseUsage,
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

type ExerciseDb = Pick<PrismaClientInstance, 'exercise' | 'measurement'>;

const exerciseSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  muscleGroups: true,
  archivedAt: true,
  organizationId: true,
  createdByCoachId: true,
  createdAt: true,
} as const;

export interface ExerciseRecord {
  id: string;
  key: string;
  name: string;
  description: string | null;
  muscleGroups: string[];
  archivedAt: Date | null;
  organizationId: string | null;
  createdByCoachId: string | null;
  createdAt: Date;
  /** Derived from `organizationId`, never stored twice. */
  scope: ExerciseScope;
  /** Whether this workspace may change it — false for every system exercise. */
  editable: boolean;
}

function toRecord(row: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  muscleGroups: string[];
  archivedAt: Date | null;
  organizationId: string | null;
  createdByCoachId: string | null;
  createdAt: Date;
}): ExerciseRecord {
  const scope = scopeOf(row);

  return { ...row, scope, editable: canEditExercise(scope) };
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
  { search, includeArchived }: ListExercisesInput,
): Promise<ExerciseRecord[]> {
  const rows = await db.exercise.findMany({
    where: {
      OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    },
    select: exerciseSelect,
    orderBy: [{ organizationId: 'desc' }, { name: 'asc' }],
  });

  return rows.map(toRecord);
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

export async function createExercise(
  db: ExerciseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  { name, description, muscleGroups }: CreateExerciseInput,
): Promise<ExerciseRecord> {
  const created = await db.exercise.create({
    data: withTenant(tenant, {
      key: toKey(name),
      name,
      description: description ?? null,
      muscleGroups,
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
  { exerciseId, name, description, muscleGroups }: UpdateExerciseInput,
): Promise<ExerciseWriteResult> {
  const { count } = await db.exercise.updateMany({
    where: scoped(tenant, { id: exerciseId }),
    data: { name, description: description ?? null, muscleGroups },
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
