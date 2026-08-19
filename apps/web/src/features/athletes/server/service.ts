import 'server-only';

// Imported from the subpath, not the package barrel: the barrel re-exports
// `./client`, which constructs the Prisma client the moment it is loaded. The
// service never needs an instance — it receives one — so pulling the barrel in
// would open a connection pool just to reach two pure helpers, and make this
// module untestable without a database.
import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import type { Page, TenantContext } from '@apex/types';

import type { CreateAthleteInput, ListAthletesInput, UpdateAthleteInput } from '../schemas';

/**
 * Athlete data access — the only module in this slice that touches the
 * database.
 *
 * **Every query goes through `scoped()` and every write through
 * `withTenant()`.** Not as a style preference: with a shared-schema tenancy
 * model, isolation is exactly as good as the discipline of the queries, and a
 * single forgotten `where` is a cross-tenant leak. Routing it through one
 * helper makes any deviation visible in a diff — and testable without a
 * database, which `service.test.ts` does.
 *
 * The functions take `db` and `tenant` as arguments rather than importing a
 * singleton. That is what lets the tenancy guarantee be tested directly instead
 * of trusted.
 */

/** The slice of the client this service needs. */
type AthleteDb = Pick<PrismaClientInstance, 'athlete'>;

/** Columns returned to the roster and detail views. */
const athleteSelect = {
  id: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  email: true,
  phone: true,
  heightCm: true,
  weightKg: true,
  archivedAt: true,
  createdAt: true,
  userId: true,
  createdByCoachId: true,
} as const;

export interface AthleteRecord {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  email: string | null;
  phone: string | null;
  /** Centimetres and kilograms — the units the columns are declared in. */
  heightCm: number | null;
  weightKg: number | null;
  archivedAt: Date | null;
  createdAt: Date;
  userId: string | null;
  createdByCoachId: string;
}

/**
 * A `Decimal(5,2)` column, as a number.
 *
 * Prisma hands back a `Decimal` object, not a `number`, and superjson carries it
 * to the client as one — where `String()` on it stringifies an object rather
 * than the value. `slots.ts` narrows defensively for exactly this reason.
 *
 * Here the conversion happens once, at the service boundary, so no caller ever
 * meets a `Decimal`. That is the opposite choice from a lactate reading, and for
 * the opposite reason: two decimals of a height carry no precision worth
 * protecting, and a value the UI can format directly is worth more.
 */
const toNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/** Rows leave this module as plain numbers; nothing above it sees a `Decimal`. */
const toRecord = (row: Record<string, unknown>): AthleteRecord =>
  ({
    ...row,
    heightCm: toNumber(row['heightCm']),
    weightKg: toNumber(row['weightKg']),
  }) as AthleteRecord;

/**
 * Roster page.
 *
 * Cursor pagination, ordered by surname. The `id` tiebreaker is not decoration:
 * a cursor needs a total order, and two athletes may share a name.
 */
export async function listAthletes(
  db: AthleteDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  { cursor, limit, search, includeArchived }: ListAthletesInput,
): Promise<Page<AthleteRecord>> {
  const rows = await db.athlete.findMany({
    where: scoped(tenant, {
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }),
    select: athleteSelect,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    // One extra row answers "is there a next page" without a second query.
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const items = rows.slice(0, limit).map(toRecord);

  return {
    items,
    nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
  };
}

/**
 * A single athlete, or `null`.
 *
 * `findFirst` with the tenant filter rather than `findUnique` by id: a primary
 * key proves nothing about ownership. Another tenant's athlete is
 * indistinguishable from one that does not exist, which is deliberate —
 * `FORBIDDEN` would confirm the row exists and leak the id space
 * (docs/SECURITY.md §4).
 */
export async function getAthlete(
  db: AthleteDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
): Promise<AthleteRecord | null> {
  const row = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId }),
    select: athleteSelect,
  });

  return row === null ? null : toRecord(row);
}

export async function createAthlete(
  db: AthleteDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  input: CreateAthleteInput,
): Promise<AthleteRecord> {
  const row = await db.athlete.create({
    data: withTenant(tenant, {
      firstName: input.firstName,
      lastName: input.lastName,
      // The schema has already turned an untouched field into `undefined`, so
      // absence is unambiguous here.
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      heightCm: input.heightCm ?? null,
      weightKg: input.weightKg ?? null,
      createdByCoachId,
    }),
    select: athleteSelect,
  });

  return toRecord(row);
}

/**
 * Updates an athlete, scoped.
 *
 * `updateMany` rather than `update`: the latter takes a unique `where` and
 * cannot carry the tenant filter, so it would happily write another tenant's
 * row. A zero count means "not in this workspace" and is reported as not found.
 */
export async function updateAthlete(
  db: AthleteDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  { athleteId, ...fields }: UpdateAthleteInput,
): Promise<AthleteRecord | null> {
  const { count } = await db.athlete.updateMany({
    where: scoped(tenant, { id: athleteId }),
    data: {
      ...(fields.firstName === undefined ? {} : { firstName: fields.firstName }),
      ...(fields.lastName === undefined ? {} : { lastName: fields.lastName }),
      ...(fields.dateOfBirth === undefined
        ? {}
        : { dateOfBirth: fields.dateOfBirth ? new Date(fields.dateOfBirth) : null }),
      ...(fields.email === undefined ? {} : { email: fields.email ?? null }),
      ...(fields.phone === undefined ? {} : { phone: fields.phone ?? null }),
      ...(fields.heightCm === undefined ? {} : { heightCm: fields.heightCm }),
      ...(fields.weightKg === undefined ? {} : { weightKg: fields.weightKg }),
    },
  });

  return count === 0 ? null : getAthlete(db, tenant, athleteId);
}

/**
 * Archives or reactivates an athlete.
 *
 * **Athletes are never deleted** (§22): the performance history outlives the
 * coaching relationship, and the findings drawn from it are the coach's
 * professional documentation. Archiving is reversible.
 *
 * Once the athlete portal exists, an archived athlete keeps read access and
 * loses every write (§21) — that check belongs to the portal guard, not here.
 */
export async function setAthleteArchived(
  db: AthleteDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  archived: boolean,
): Promise<AthleteRecord | null> {
  const { count } = await db.athlete.updateMany({
    where: scoped(tenant, { id: athleteId }),
    data: { archivedAt: archived ? new Date() : null },
  });

  return count === 0 ? null : getAthlete(db, tenant, athleteId);
}
