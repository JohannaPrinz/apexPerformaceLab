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
