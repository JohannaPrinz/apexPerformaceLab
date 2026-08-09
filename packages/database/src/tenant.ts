import type { TenantContext } from '@apex/types';

/**
 * Tenant scoping helpers.
 *
 * With a shared-schema tenancy model, isolation is only as good as the
 * discipline of the queries. Rather than trusting every call site to remember
 * `where: { organizationId }`, feature repositories are expected to build their
 * filters through these helpers — a single, greppable, reviewable choke point.
 *
 * A future hardening step is Postgres row-level security enforced by a
 * per-request `SET LOCAL app.organization_id`, at which point these helpers
 * become defence in depth rather than the sole control. Tracked in
 * docs/SECURITY.md.
 */

/** The discriminator column present on every tenant-owned table. */
export const TENANT_KEY = 'organizationId' as const;

export type TenantScoped<TWhere> = TWhere & { organizationId: string };

/**
 * Merges a tenant filter into a Prisma `where` clause.
 *
 * The tenant key is applied last, so a caller cannot widen the scope by passing
 * their own `organizationId`.
 */
export function scoped<TWhere extends Record<string, unknown>>(
  ctx: Pick<TenantContext, 'organizationId'>,
  where?: TWhere,
): TenantScoped<TWhere> {
  return {
    ...(where ?? ({} as TWhere)),
    [TENANT_KEY]: ctx.organizationId,
  };
}

/** Merges the tenant key into `create`/`update` data. */
export function withTenant<TData extends Record<string, unknown>>(
  ctx: Pick<TenantContext, 'organizationId'>,
  data: TData,
): TenantScoped<TData> {
  return {
    ...data,
    [TENANT_KEY]: ctx.organizationId,
  };
}

/**
 * Asserts that a loaded row belongs to the active tenant.
 *
 * Use after any lookup by primary key — an ID alone never proves ownership.
 */
export function assertTenant(
  ctx: Pick<TenantContext, 'organizationId'>,
  row: { organizationId: string } | null | undefined,
  resource = 'Resource',
): asserts row is { organizationId: string } {
  if (row?.organizationId !== ctx.organizationId) {
    throw new Error(`${resource} not found in the active organization.`);
  }
}
