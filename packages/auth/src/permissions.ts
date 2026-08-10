import { createAccessControl } from 'better-auth/plugins/access';

/**
 * Access control statements for the organization plugin.
 *
 * This mirrors the coarse role model in `@apex/types` → `PERMISSIONS`, expressed
 * in the shape Better Auth's `organization` plugin consumes. Two representations
 * exist because they serve different layers: this one gates Better Auth's own
 * endpoints (invite, remove member, update org), while `@apex/types` gates our
 * tRPC procedures. Keep them in step when adding a capability.
 *
 * **Every role in this file is scoped to one organization** and is granted by a
 * `Membership` row. There is no role here that spans organizations, and none
 * may be added: the system-wide operator role is `platformAdmin`, it is a
 * separate concept, and it must never be expressed as a membership. See
 * `docs/SECURITY.md` §3.
 *
 * A resource enters this list when the slice that owns it is built. The
 * previous entries `training`, `nutrition` and `analysis` predated the domain
 * model and were removed rather than renamed — guessing at the permissions of
 * unbuilt features produces a matrix nobody can review.
 */
const statement = {
  organization: ['read', 'update', 'delete'],
  member: ['read', 'invite', 'update', 'remove'],
  invitation: ['create', 'cancel'],
  athlete: ['read', 'write', 'delete'],
  case: ['read', 'write'],
  billing: ['read', 'manage'],
} as const;

export const accessControl = createAccessControl(statement);

export const owner = accessControl.newRole({
  organization: ['read', 'update', 'delete'],
  member: ['read', 'invite', 'update', 'remove'],
  invitation: ['create', 'cancel'],
  athlete: ['read', 'write', 'delete'],
  case: ['read', 'write'],
  billing: ['read', 'manage'],
});

/** Organization admin — full member and settings control, no billing changes. */
export const admin = accessControl.newRole({
  organization: ['read', 'update'],
  member: ['read', 'invite', 'update', 'remove'],
  invitation: ['create', 'cancel'],
  athlete: ['read', 'write', 'delete'],
  case: ['read', 'write'],
  billing: ['read'],
});

export const coach = accessControl.newRole({
  organization: ['read'],
  member: ['read'],
  athlete: ['read', 'write'],
  case: ['read', 'write'],
});

/**
 * Athletes see their own records only; row scoping is enforced in the data
 * layer, not here.
 *
 * Deliberately narrow while the portal is unbuilt: the resources it will read —
 * reports, recommendations, programs — are added with that slice.
 */
export const athlete = accessControl.newRole({
  organization: ['read'],
});

export const roles = { owner, admin, coach, athlete };

export type AppRole = keyof typeof roles;
