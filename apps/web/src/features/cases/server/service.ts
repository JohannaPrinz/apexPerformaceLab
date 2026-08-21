import 'server-only';

// Subpath, not the package barrel: the barrel constructs the Prisma client on
// load. See the same note in the athletes service.
import type { PrismaClientInstance } from '@apex/database';
import { scoped } from '@apex/database/tenant';
import type { TenantContext } from '@apex/types';

import { caseSelect, type CaseRecord } from '@/services/case-provisioning';

import type { ListCasesInput, UpdateCaseInput } from '../schemas';

/**
 * Performance case reads.
 *
 * The **writes** live in `@/services/case-provisioning`: the assessments slice
 * needs them too (§8), and `src/services/README.md` is explicit that logic
 * moves there once a second slice needs it. Keeping two implementations of
 * "create a case for this athlete" would mean two places to forget the tenant
 * check.
 *
 * Everything here goes through `scoped()`, for the reasons set out in the
 * athletes service.
 */

type CaseDb = Pick<PrismaClientInstance, 'performanceCase'>;

export { createCase, ensureOpenCase, type CaseRecord } from '@/services/case-provisioning';

/**
 * The cases of one athlete, newest first.
 *
 * Not paginated: a case is a container for a whole coaching journey, so an
 * athlete has a handful, not hundreds. Cursor pagination here would be
 * machinery without a load to carry — it belongs on assessments and
 * measurements, which do grow without bound.
 */
export async function listCasesForAthlete(
  db: CaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  { athleteId, status }: ListCasesInput,
): Promise<CaseRecord[]> {
  return db.performanceCase.findMany({
    where: scoped(tenant, { athleteId, ...(status ? { status } : {}) }),
    select: caseSelect,
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
  });
}

export async function getCase(
  db: CaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  caseId: string,
): Promise<CaseRecord | null> {
  return db.performanceCase.findFirst({
    where: scoped(tenant, { id: caseId }),
    select: caseSelect,
  });
}

/**
 * Moves a case through `OPEN → CLOSED → ARCHIVED`.
 *
 * `endedAt` follows the status rather than being set by hand: a case that
 * leaves `OPEN` has ended, and reopening clears it. Two fields that must agree
 * are better derived than remembered.
 */
export async function setCaseStatus(
  db: CaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  caseId: string,
  status: CaseRecord['status'],
): Promise<CaseRecord | null> {
  const { count } = await db.performanceCase.updateMany({
    where: scoped(tenant, { id: caseId }),
    data: { status, endedAt: status === 'OPEN' ? null : new Date() },
  });

  return count === 0 ? null : getCase(db, tenant, caseId);
}

/**
 * Corrects what a case says about itself.
 *
 * `updateMany` with `scoped()`, never a bare `update`: the latter takes a unique
 * `where` and cannot carry the tenant filter, so it would happily write another
 * workspace's row. A zero count means "not in this workspace" and is reported as
 * not found — never as forbidden, which would confirm the row exists
 * (docs/SECURITY.md §4).
 *
 * Status is deliberately not writable here; it has its own transitions and its
 * own procedure.
 */
export async function updateCase(
  db: CaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  { caseId, ...fields }: UpdateCaseInput,
): Promise<CaseRecord | null> {
  const { count } = await db.performanceCase.updateMany({
    where: scoped(tenant, { id: caseId }),
    data: {
      ...(fields.title === undefined ? {} : { title: fields.title }),
      ...(fields.description === undefined ? {} : { description: fields.description }),
      ...(fields.type === undefined ? {} : { type: fields.type }),
    },
  });

  return count === 0 ? null : getCase(db, tenant, caseId);
}
