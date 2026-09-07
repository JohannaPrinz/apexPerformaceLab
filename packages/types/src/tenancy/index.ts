import { z } from 'zod';

/**
 * Tenancy model.
 *
 * Apex OS is multi-tenant from day one: the tenant is the *organization*
 * (a coaching business), and every domain row is scoped to one. This is defined
 * here — outside the database package — so that the app, the API layer and any
 * future service can agree on the shape without importing Prisma.
 *
 * See `docs/ARCHITECTURE.md` for the isolation strategy.
 */

/**
 * Role within an organization.
 *
 * Deliberately coarse. Fine-grained permissions are derived from the role
 * (see `PERMISSIONS`) rather than stored per user, so adding a capability is a
 * code change with a reviewable diff instead of a data migration.
 *
 * **Every role here is scoped to one organization** and is granted by a
 * `Membership` row. `admin` therefore means *organization admin* — nothing in
 * this enum spans organizations, and nothing may be added that does. The
 * system-wide operator role is `platformAdmin`; it is a separate concept, lives
 * outside the tenancy model, and is not implemented yet. See
 * `docs/SECURITY.md` §3.
 */
export const organizationRoleSchema = z.enum(['owner', 'admin', 'coach', 'athlete']);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const ORGANIZATION_ROLES = organizationRoleSchema.options;

/**
 * Capabilities a role may exercise. Checked in the tRPC middleware layer.
 *
 * A resource enters this list when the slice that owns it is built. `training`,
 * `nutrition` and `analysis` were removed rather than renamed: they came from a
 * taxonomy that predates the domain model, and inventing permissions for
 * unbuilt features produces a matrix nobody can review against a real screen.
 */
export const permissionSchema = z.enum([
  'organization:read',
  'organization:update',
  'organization:delete',
  'member:invite',
  'member:remove',
  'athlete:read',
  'athlete:write',
  'athlete:delete',
  'case:read',
  'case:write',
  'assessment:read',
  'assessment:write',
  'measurement:read',
  'measurement:write',
  'exercise:read',
  'exercise:write',
  'report:read',
  'report:write',
  'billing:manage',
]);
export type Permission = z.infer<typeof permissionSchema>;

/**
 * Role → permission matrix.
 *
 * `athlete` intentionally sees only its own records; that narrowing is enforced
 * by row-level scoping in the data layer, not by this table.
 */
export const PERMISSIONS: Readonly<Record<OrganizationRole, readonly Permission[]>> = {
  owner: permissionSchema.options,
  admin: [
    'organization:read',
    'organization:update',
    'member:invite',
    'member:remove',
    'athlete:read',
    'athlete:write',
    'athlete:delete',
    'case:read',
    'case:write',
    'assessment:read',
    'assessment:write',
    'measurement:read',
    'measurement:write',
    'exercise:read',
    'exercise:write',
    'report:read',
    'report:write',
  ],
  coach: [
    'organization:read',
    'athlete:read',
    'athlete:write',
    'case:read',
    'case:write',
    'assessment:read',
    'assessment:write',
    'measurement:read',
    'measurement:write',
    'exercise:read',
    'exercise:write',
    'report:read',
    'report:write',
  ],
  /**
   * Narrow **on purpose**, and it stays narrow now that the portal exists.
   *
   * The portal does not run on this matrix. `athleteProcedure` resolves the one
   * record the account is linked to, and every portal procedure is scoped to
   * that record rather than to a permission over "athletes" (§21). Granting
   * `athlete:read` here would be exactly the wrong move: it means "every
   * athlete of this workspace", which is a coach's reach, not an athlete's.
   *
   * `organization:read` is what a membership needs to establish a tenant scope
   * at all. Anything the portal gains later belongs on the same rung — one
   * athlete, resolved from the session — not in this row.
   */
  athlete: ['organization:read'],
} as const;

export function hasPermission(role: OrganizationRole, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}

/**
 * The tenant context resolved once per request and threaded through every
 * service call. Nothing in the data layer should query without one.
 */
export interface TenantContext {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: OrganizationRole;
}
