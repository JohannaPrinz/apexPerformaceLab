import { describe, expect, it } from 'vitest';

import {
  hasPermission,
  ORGANIZATION_ROLES,
  PERMISSIONS,
  permissionSchema,
  type Permission,
} from './index';

/**
 * The permission matrix is the authorization boundary for every tRPC procedure,
 * so it is tested as a table — including the denials. A suite that only asserts
 * what each role *may* do would still pass if a role were accidentally granted
 * everything, which is precisely the regression that matters here.
 */
describe('PERMISSIONS matrix', () => {
  it('defines an entry for every role', () => {
    for (const role of ORGANIZATION_ROLES) {
      expect(PERMISSIONS[role], `missing entry for role "${role}"`).toBeDefined();
    }
  });

  it('grants no permission outside the declared schema', () => {
    for (const role of ORGANIZATION_ROLES) {
      for (const permission of PERMISSIONS[role]) {
        expect(permissionSchema.safeParse(permission).success).toBe(true);
      }
    }
  });

  it('grants the owner every permission', () => {
    for (const permission of permissionSchema.options) {
      expect(hasPermission('owner', permission)).toBe(true);
    }
  });

  it('reserves organization deletion and billing for the owner', () => {
    const ownerOnly: Permission[] = ['organization:delete', 'billing:manage'];

    for (const permission of ownerOnly) {
      expect(hasPermission('owner', permission)).toBe(true);
      expect(hasPermission('admin', permission)).toBe(false);
      expect(hasPermission('coach', permission)).toBe(false);
      expect(hasPermission('athlete', permission)).toBe(false);
    }
  });

  it('denies a coach any member management', () => {
    expect(hasPermission('coach', 'member:invite')).toBe(false);
    expect(hasPermission('coach', 'member:remove')).toBe(false);
  });

  it('lets a coach edit athletes but not delete them', () => {
    expect(hasPermission('coach', 'athlete:write')).toBe(true);
    expect(hasPermission('coach', 'athlete:delete')).toBe(false);
  });

  /**
   * `training`, `nutrition` and `analysis` came from a taxonomy that predates
   * the domain model and were removed, not renamed. This pins that: a resource
   * enters the schema when the slice that owns it is built, not before.
   */
  it('carries no resource from the pre-domain taxonomy', () => {
    const retired = ['training', 'nutrition', 'analysis'];

    for (const permission of permissionSchema.options) {
      const resource = permission.split(':')[0];
      expect(retired, `"${permission}" belongs to a retired resource`).not.toContain(resource);
    }
  });

  /**
   * Every role here is granted by a `Membership` and is therefore scoped to one
   * organization. The system-wide operator role is `platformAdmin`, it lives
   * outside the tenancy model, and it must never appear as an organization
   * role — see docs/SECURITY.md §3.
   */
  it('holds no role that spans organizations', () => {
    expect(ORGANIZATION_ROLES).not.toContain('platformAdmin');
    expect(ORGANIZATION_ROLES).toEqual(['owner', 'admin', 'coach', 'athlete']);
  });

  it('restricts an athlete to read-only access', () => {
    const writes = permissionSchema.options.filter((permission) => !permission.endsWith(':read'));

    for (const permission of writes) {
      expect(hasPermission('athlete', permission), `athlete should not hold ${permission}`).toBe(
        false,
      );
    }
  });

  it('never grants a narrower role more than a broader one', () => {
    const widerThan: readonly (readonly [
      narrow: 'admin' | 'coach' | 'athlete',
      wide: 'owner' | 'admin' | 'coach',
    ])[] = [
      ['admin', 'owner'],
      ['coach', 'admin'],
      ['athlete', 'coach'],
    ];

    for (const [narrow, wide] of widerThan) {
      for (const permission of PERMISSIONS[narrow]) {
        expect(
          hasPermission(wide, permission),
          `"${wide}" must hold every permission of "${narrow}" (missing ${permission})`,
        ).toBe(true);
      }
    }
  });
});
