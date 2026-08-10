import 'server-only';

import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import { auth } from '@apex/auth';
import { db } from '@apex/database';
import { AppError, hasPermission, type Permission, type TenantContext } from '@apex/types';

/**
 * tRPC initialisation — the API layer's foundation.
 *
 * Why tRPC alongside Server Actions: they solve different problems and the
 * project uses both deliberately.
 *   • Server Actions — form submissions and mutations initiated by a specific
 *     component. Progressive enhancement, no client-side wiring.
 *   • tRPC — everything that needs a *queryable, cacheable, composable* API:
 *     lists with pagination, polling, optimistic updates, and (later) the
 *     mobile client, which cannot call Server Actions at all.
 *
 * The rule: procedures hold the business logic; a Server Action is a thin
 * caller. That keeps one implementation and one authorization path.
 */

export interface CreateContextOptions {
  headers: Headers;
}

/**
 * Per-request context.
 *
 * The session is resolved once here, and the tenant scope is derived from
 * `session.activeOrganizationId` — never from a client-supplied parameter. That
 * single decision is what prevents cross-tenant access via a forged ID.
 */
export async function createTRPCContext({ headers }: CreateContextOptions) {
  const session = await auth.api.getSession({ headers });

  return {
    db,
    headers,
    session,
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  // superjson preserves Date, Map, Set and BigInt across the wire — relevant
  // everywhere in a training/calendar domain.
  transformer: superjson,

  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Surface Zod issues in a shape the client form layer can consume
        // directly, instead of a stringified message.
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
        appErrorCode: error.cause instanceof AppError ? error.cause.code : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Timing middleware.
 *
 * In development it adds a small artificial delay. That is intentional: it
 * makes missing loading states visible locally rather than in production on a
 * slow connection.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 200) + 50));
  }

  const result = await next();

  if (t._config.isDev) {
    console.info(`[trpc] ${path} took ${Date.now() - start}ms`);
  }

  return result;
});

/** Unauthenticated. Use only for genuinely public data. */
export const publicProcedure = t.procedure.use(timingMiddleware);

/** Requires a signed-in user. Does not imply an organization scope. */
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', cause: AppError.unauthenticated() });
  }

  return next({
    ctx: { ...ctx, session: { ...ctx.session, user: ctx.session.user } },
  });
});

/**
 * Requires a signed-in user **with an active organization**.
 *
 * This is the default procedure for all feature code. It produces a
 * `TenantContext` that the data layer's scoping helpers consume, so a query
 * cannot accidentally run unscoped.
 */
export const organizationProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const organizationId = ctx.session.session.activeOrganizationId;

  if (!organizationId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'No active organization selected.',
      cause: AppError.forbidden('No active organization selected.'),
    });
  }

  const membership = await ctx.db.membership.findUnique({
    where: {
      userId_organizationId: { userId: ctx.session.user.id, organizationId },
    },
    select: { role: true },
  });

  if (!membership) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You are not a member of this organization.',
      cause: AppError.forbidden(),
    });
  }

  const tenant: TenantContext = {
    organizationId,
    userId: ctx.session.user.id,
    role: membership.role,
  };

  return next({ ctx: { ...ctx, tenant } });
});

/**
 * Requires a signed-in user **with a coach profile**, on top of the tenant
 * scope.
 *
 * Every domain object records who authored it — `createdByCoachId` on Cases,
 * Athletes and Appointments, `authorCoachId` on Insights, Reports and Notes.
 * That identity is the `Coach`, not the `User`: the two are deliberately
 * separate (§26.22), so the id cannot be taken from the session.
 *
 * This rung exists so the lookup and its error handling live in one place
 * rather than at the top of every authoring mutation.
 */
export const coachProcedure = organizationProcedure.use(async ({ ctx, next }) => {
  const coach = await ctx.db.coach.findUnique({
    where: { userId: ctx.session.user.id },
    select: { id: true },
  });

  if (!coach) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This action requires a coach profile.',
      cause: AppError.forbidden('This action requires a coach profile.'),
    });
  }

  return next({ ctx: { ...ctx, coach } });
});

/** Shared by the two permission-gated builders below. */
const requirePermission = (permission: Permission) =>
  t.middleware(({ ctx, next }) => {
    const tenant = (ctx as { tenant?: TenantContext }).tenant;

    if (!tenant || !hasPermission(tenant.role, permission)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Your role (${tenant?.role ?? 'unknown'}) cannot perform "${permission}".`,
        cause: AppError.forbidden(),
      });
    }

    return next();
  });

/**
 * Builds a procedure that additionally requires a specific permission.
 *
 * @example
 * ```ts
 * const archiveAthlete = withPermission('athlete:write').mutation(...)
 * ```
 */
export function withPermission(permission: Permission) {
  return organizationProcedure.use(requirePermission(permission));
}

/**
 * Same, but also resolves the coach profile — for mutations that record
 * authorship.
 *
 * @example
 * ```ts
 * const createAthlete = withCoachPermission('athlete:write').mutation(...)
 * ```
 */
export function withCoachPermission(permission: Permission) {
  return coachProcedure.use(requirePermission(permission));
}
