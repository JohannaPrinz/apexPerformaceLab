import 'server-only';

// Subpath, not the package barrel: the barrel constructs the Prisma client on
// load, and this module receives one instead.
import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import type { TenantContext } from '@apex/types';

/**
 * Creating the Performance Case an object needs.
 *
 * Shared because two slices need it: `cases` offers the deliberate path, and
 * `assessments` needs the automatic one (§8). A second implementation of
 * "which case does this belong to" is exactly how the two query paths the
 * domain avoids would reappear — and one of the two would eventually forget
 * the tenant check.
 *
 * Reading cases stays with the `cases` slice; only the writes live here.
 */

type CaseDb = Pick<PrismaClientInstance, 'performanceCase' | 'athlete'>;

export const caseSelect = {
  id: true,
  title: true,
  description: true,
  type: true,
  status: true,
  startedAt: true,
  endedAt: true,
  athleteId: true,
  createdByCoachId: true,
  createdAt: true,
} as const;

export interface CaseRecord {
  id: string;
  title: string;
  description: string | null;
  type: 'SINGLE_ASSESSMENT' | 'ONGOING';
  status: 'OPEN' | 'CLOSED' | 'ARCHIVED';
  startedAt: Date;
  endedAt: Date | null;
  athleteId: string;
  createdByCoachId: string;
  createdAt: Date;
}

export interface CreateCaseData {
  readonly athleteId: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly type: CaseRecord['type'];
}

/**
 * Creates a case for an athlete.
 *
 * Returns `null` when the athlete does not exist **in this workspace** — the
 * parent is checked rather than trusted. Without that check a caller could hang
 * a case off another tenant's athlete: the case row itself would be correctly
 * scoped, and the leak would be the *relationship*, which no column constraint
 * catches.
 */
export async function createCase(
  db: CaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  { athleteId, title, description, type }: CreateCaseData,
): Promise<CaseRecord | null> {
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId }),
    select: { id: true },
  });

  if (!athlete) return null;

  return db.performanceCase.create({
    data: withTenant(tenant, {
      athleteId,
      title,
      description: description ?? null,
      type,
      createdByCoachId,
    }),
    select: caseSelect,
  });
}

/**
 * Opens the case an assessment should belong to, creating one if needed (§8).
 *
 * The Case is mandatory in the model but **never a manual step**. A coach who
 * starts an assessment for an athlete with no open case gets one created
 * automatically, of type `SINGLE_ASSESSMENT` — which is why that type exists.
 *
 * Allowing an assessment without a case would mean two query paths and two
 * authorization paths for every question about an athlete's work. One implicit
 * row is cheaper than that fork, permanently.
 */
export async function ensureOpenCase(
  db: CaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  athleteId: string,
  fallbackTitle: string,
): Promise<CaseRecord | null> {
  const open = await db.performanceCase.findFirst({
    // `as const` so the literal keeps its enum type through the generic.
    where: scoped(tenant, { athleteId, status: 'OPEN' as const }),
    select: caseSelect,
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
  });

  if (open) return open;

  return createCase(db, tenant, createdByCoachId, {
    athleteId,
    title: fallbackTitle,
    type: 'SINGLE_ASSESSMENT',
  });
}
