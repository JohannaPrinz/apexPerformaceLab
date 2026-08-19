import 'server-only';

import { TRPCError } from '@trpc/server';

import { AppError } from '@apex/types';

import { createTRPCRouter, organizationProcedure, protectedProcedure } from '@/server/api/trpc';

/**
 * Auth slice router — identity and workspace context.
 *
 * Registration and sign-in themselves are Better Auth endpoints under
 * `/api/auth/*`; this router does not duplicate them. What it owns is the
 * question the rest of the app asks constantly: *which workspace am I in, and
 * as what*.
 */
export const authRouter = createTRPCRouter({
  /**
   * The workspace the session is currently acting in.
   *
   * Derived entirely from `Session.activeOrganizationId` + `Membership` —
   * `organizationProcedure` has already proven the membership exists before
   * this runs. Nothing here reads the coach profile, which holds no
   * organization by design (§6); a coach may belong to several.
   */
  currentWorkspace: organizationProcedure.query(async ({ ctx }) => {
    const organization = await ctx.db.organization.findUnique({
      where: { id: ctx.tenant.organizationId },
      select: { id: true, name: true, slug: true, createdAt: true },
    });

    if (!organization) {
      // The membership was just verified and cascades with the organization, so
      // this means the row vanished mid-request. Fail loudly rather than
      // rendering an empty workspace.
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'The active workspace no longer exists.',
        cause: AppError.notFound('Organization'),
      });
    }

    return { ...organization, role: ctx.tenant.role };
  }),

  /**
   * Every workspace this user belongs to, with their role in each.
   *
   * Better Auth's organization plugin can already list organizations and switch
   * the active one (`/organization/list`, `/organization/set-active`), but the
   * list carries no membership role — and "Inhaber" against "Coach" is what
   * makes the personal overview more than a list of names.
   *
   * `protectedProcedure`, not `organizationProcedure`: this is the question a
   * coach asks *before* choosing a workspace, so requiring one would be
   * circular.
   *
   * Ordered oldest first, the same order `resolveInitialOrganizationId` uses, so
   * the workspace a session starts in is the one listed first.
   */
  myWorkspaces: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.membership.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        createdAt: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    return memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
      joinedAt: membership.createdAt,
    }));
  }),

  /**
   * The signed-in user's coach profile.
   *
   * `protectedProcedure`, not `organizationProcedure`: the profile is a
   * property of the person and is readable without a workspace scope. `null` is
   * a legitimate answer — a user need not be a coach.
   */
  coachProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.coach.findUnique({
      where: { userId: ctx.session.user.id },
      select: {
        id: true,
        displayName: true,
        professionalTitle: true,
        createdAt: true,
      },
    });
  }),
});
