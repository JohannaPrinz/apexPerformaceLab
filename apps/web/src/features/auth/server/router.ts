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
