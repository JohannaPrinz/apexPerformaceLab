import { createAccessControl } from 'better-auth/plugins/access';

/**
 * Access control statements for the organization plugin.
 *
 * This mirrors the coarse role model in `@apex/types` → `PERMISSIONS`, expressed
 * in the shape Better Auth's `organization` plugin consumes. Two representations
 * exist because they serve different layers: this one gates Better Auth's own
 * endpoints (invite, remove member, update org), while `@apex/types` gates our
 * tRPC procedures. Keep them in step when adding a capability.
 */
const statement = {
  organization: ['read', 'update', 'delete'],
  member: ['read', 'invite', 'update', 'remove'],
  invitation: ['create', 'cancel'],
  athlete: ['read', 'write', 'delete'],
  training: ['read', 'write'],
  nutrition: ['read', 'write'],
  analysis: ['read', 'write'],
  billing: ['read', 'manage'],
} as const;

export const accessControl = createAccessControl(statement);

export const owner = accessControl.newRole({
  organization: ['read', 'update', 'delete'],
  member: ['read', 'invite', 'update', 'remove'],
  invitation: ['create', 'cancel'],
  athlete: ['read', 'write', 'delete'],
  training: ['read', 'write'],
  nutrition: ['read', 'write'],
  analysis: ['read', 'write'],
  billing: ['read', 'manage'],
});

export const admin = accessControl.newRole({
  organization: ['read', 'update'],
  member: ['read', 'invite', 'update', 'remove'],
  invitation: ['create', 'cancel'],
  athlete: ['read', 'write', 'delete'],
  training: ['read', 'write'],
  nutrition: ['read', 'write'],
  analysis: ['read', 'write'],
  billing: ['read'],
});

export const coach = accessControl.newRole({
  organization: ['read'],
  member: ['read'],
  athlete: ['read', 'write'],
  training: ['read', 'write'],
  nutrition: ['read', 'write'],
  analysis: ['read', 'write'],
});

/** Athletes see their own records only; row scoping is enforced in the data layer. */
export const athlete = accessControl.newRole({
  organization: ['read'],
  training: ['read'],
  nutrition: ['read'],
  analysis: ['read'],
});

export const roles = { owner, admin, coach, athlete };

export type AppRole = keyof typeof roles;
