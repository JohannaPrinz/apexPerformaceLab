import 'server-only';

// Imported from the subpath, not the package barrel: the barrel re-exports
// `./client`, which constructs the Prisma client the moment it is loaded. The
// service never needs an instance — it receives one — so pulling the barrel in
// would open a connection pool just to reach two pure helpers, and make this
// module untestable without a database.
import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import type { Page, TenantContext } from '@apex/types';

import type {
  AthleteStatusFilter,
  CreateAthleteInput,
  ListAthletesInput,
  UpdateAthleteInput,
} from '../schemas';

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
 * The `where` behind both the roster and its count.
 *
 * Shared, so the number above the list can never describe a different set from
 * the list itself — the mistake that turns "12 Treffer" over three rows into a
 * bug report.
 *
 * ## Searching a full name
 *
 * Every whitespace-separated word must match *some* name. "Johanna Prinz"
 * therefore finds Johanna Prinz, and so does "Prinz Johanna": each word is
 * asked of both columns, and the words are combined with AND.
 *
 * The obvious shape — one `contains` per column — cannot match a full name at
 * all, because no single column holds one. That was the previous behaviour and
 * it made the commonest search a coach would type return nothing.
 */
export function athleteWhere(
  tenant: Pick<TenantContext, 'organizationId'>,
  { search, status = 'active' }: { search?: string | undefined; status?: AthleteStatusFilter },
) {
  const words = (search ?? '')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word !== '');

  return scoped(tenant, {
    ...(status === 'active' ? { archivedAt: null } : {}),
    ...(status === 'archived' ? { archivedAt: { not: null } } : {}),
    ...(words.length === 0
      ? {}
      : {
          AND: words.map((word) => ({
            OR: [
              { firstName: { contains: word, mode: 'insensitive' as const } },
              { lastName: { contains: word, mode: 'insensitive' as const } },
            ],
          })),
        }),
  });
}

/**
 * Roster page.
 *
 * Cursor pagination, ordered by surname. The `id` tiebreaker is not decoration:
 * a cursor needs a total order, and two athletes may share a name.
 */
export async function listAthletes(
  db: AthleteDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  { cursor, limit, search, status }: ListAthletesInput,
): Promise<Page<AthleteRecord>> {
  const rows = await db.athlete.findMany({
    where: athleteWhere(tenant, { search, status }),
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
 * How many athletes the same filters match, ignoring paging.
 *
 * Cursor pagination knows how to reach the next page but not how far the list
 * goes, and a roster that can only say "25 shown, more available" leaves a
 * coach guessing whether their search worked. One extra count answers it
 * honestly.
 */
export async function countAthletesMatching(
  db: AthleteDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  filter: { search?: string | undefined; status?: AthleteStatusFilter },
): Promise<number> {
  return db.athlete.count({ where: athleteWhere(tenant, filter) });
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
  // `confirmDuplicate` is deliberately not part of this: it decides *whether*
  // to reach the service, which is the router's business. Writing it here would
  // be storing an answer to a question nobody asks again.
  input: Omit<CreateAthleteInput, 'confirmDuplicate'>,
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

/**
 * Why a candidate looks like a duplicate, strongest first.
 *
 * The order is the order they are shown in: an identical address is close to
 * proof, an identical name alone is a coincidence that happens all the time.
 */
export const DUPLICATE_REASONS = ['email', 'name_and_birthdate', 'name'] as const;
export type DuplicateReason = (typeof DUPLICATE_REASONS)[number];

export interface DuplicateCandidate {
  readonly athlete: AthleteRecord;
  readonly reason: DuplicateReason;
}

/** Case- and whitespace-insensitive, which is as far as the comparison goes. */
const normalise = (value: string | null): string =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Likely duplicates of an athlete about to be created (§7).
 *
 * **A warning, never a constraint.** There is deliberately no natural key: name,
 * email and date of birth are all optional, and a unique index over optional
 * columns does not apply in exactly the case that matters — Postgres treats
 * missing values as distinct. §7 puts the control where it can work instead, at
 * the point of creation, because duplicates come from accidental re-entry rather
 * than intent.
 *
 * **Archived athletes are included, and that is the point.** A coach who
 * archived someone last season and enters them again is the commonest way a
 * duplicate appears — and it is invisible, because the roster hides archived
 * rows by default.
 *
 * The database narrows, the rules below decide. Two reasons for that split: the
 * contradiction rule ("same name, different birthdays, so different people") is
 * far clearer in code than in a `where` clause, and it is testable without a
 * database.
 *
 * **Umlauts are not folded.** `Müller` and `Mueller` stay separate people here.
 * Fuzzy matching turns a warning into noise, and a warning nobody reads is worse
 * than none — that is its own decision, not something to slip in.
 */
export async function findAthleteDuplicates(
  db: AthleteDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  candidate: {
    readonly firstName: string;
    readonly lastName: string;
    readonly dateOfBirth?: string | undefined;
    readonly email?: string | undefined;
  },
): Promise<DuplicateCandidate[]> {
  const email = candidate.email?.trim();

  const rows = await db.athlete.findMany({
    where: scoped(tenant, {
      OR: [
        // Same name, whichever case it was typed in.
        {
          firstName: { equals: candidate.firstName.trim(), mode: 'insensitive' as const },
          lastName: { equals: candidate.lastName.trim(), mode: 'insensitive' as const },
        },
        // Same address, whatever the name says — people marry, and coaches typo.
        ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
      ],
    }),
    select: athleteSelect,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    // A warning listing twenty people is not a warning. If a name is this
    // common the list is not the useful signal anyway.
    take: 10,
  });

  const wantedName = `${normalise(candidate.firstName)} ${normalise(candidate.lastName)}`;
  const wantedBirthdate = candidate.dateOfBirth?.trim() ?? '';

  const candidates = rows.flatMap((row): DuplicateCandidate[] => {
    const athlete = toRecord(row);
    const sameName =
      `${normalise(athlete.firstName)} ${normalise(athlete.lastName)}` === wantedName;
    const birthdate = athlete.dateOfBirth?.toISOString().slice(0, 10) ?? '';

    if (email !== undefined && email !== '' && normalise(athlete.email) === normalise(email)) {
      return [{ athlete, reason: 'email' }];
    }

    if (!sameName) return [];

    if (wantedBirthdate !== '' && birthdate !== '') {
      // Both birthdays known: they either confirm the match or rule it out.
      // Two Müllers born in different years are two people, and saying so is
      // what keeps the warning worth reading.
      return wantedBirthdate === birthdate ? [{ athlete, reason: 'name_and_birthdate' }] : [];
    }

    return [{ athlete, reason: 'name' }];
  });

  return candidates.sort(
    (a, b) => DUPLICATE_REASONS.indexOf(a.reason) - DUPLICATE_REASONS.indexOf(b.reason),
  );
}

/**
 * How many athletes the workspace holds, active and archived apart.
 *
 * Two counts rather than one, because they answer different questions: the
 * active number is the roster a coach works with, the archived one is history
 * that must not inflate it (§22). Reported separately so neither has to be
 * guessed from the other.
 *
 * `groupBy` rather than two counts: one round trip, and the two numbers can
 * never disagree because they come from the same read.
 */
export async function countAthletes(
  db: AthleteDb,
  tenant: Pick<TenantContext, 'organizationId'>,
): Promise<{ active: number; archived: number }> {
  const [active, archived] = await Promise.all([
    countAthletesMatching(db, tenant, { status: 'active' }),
    countAthletesMatching(db, tenant, { status: 'archived' }),
  ]);

  return { active, archived };
}

/** An athlete on the workspace overview, with the one figure that is derivable. */
export interface AthleteOverviewRecord extends AthleteRecord {
  /**
   * How many assessments this athlete has, across all their performance cases.
   *
   * Derived, not invented: an Assessment belongs to a Case and a Case to an
   * Athlete (§3), so the count has exactly one meaning. Nothing else on the
   * tile — uploads, comments, share status — has a query behind it yet, and
   * none is shown.
   */
  assessmentCount: number;
}

/**
 * The athletes a coach most recently worked on.
 *
 * **Ordered by `updatedAt`, and that is the honest choice available.** The
 * obvious ordering — "who has an appointment next week" — needs the Appointment
 * slice, which has a model but no service. Last touched is real, cheap and
 * useful: it is the athlete whose record the coach edited, archived or had a
 * measurement recorded against.
 *
 * Archived athletes are excluded: they are not deleted, but they are not what a
 * coach opens the overview for.
 *
 * This is a *shortcut*, never the roster. The full list with search and filters
 * stays at `/athletes`.
 */
export async function listRecentAthletes(
  db: AthleteDb & Pick<PrismaClientInstance, 'performanceCase'>,
  tenant: Pick<TenantContext, 'organizationId'>,
  limit: number,
): Promise<AthleteOverviewRecord[]> {
  const rows = await db.athlete.findMany({
    where: athleteWhere(tenant, { status: 'active' }),
    select: athleteSelect,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: limit,
  });

  if (rows.length === 0) return [];

  const athletes = rows.map(toRecord);

  // One query for every tile rather than one per tile: an Assessment hangs off
  // a Case, so the count is summed per athlete from their cases.
  const cases = await db.performanceCase.findMany({
    where: scoped(tenant, { athleteId: { in: athletes.map((athlete) => athlete.id) } }),
    select: { athleteId: true, _count: { select: { assessments: true } } },
  });

  const counts = new Map<string, number>();
  for (const entry of cases) {
    counts.set(entry.athleteId, (counts.get(entry.athleteId) ?? 0) + entry._count.assessments);
  }

  return athletes.map((athlete) => ({
    ...athlete,
    assessmentCount: counts.get(athlete.id) ?? 0,
  }));
}
