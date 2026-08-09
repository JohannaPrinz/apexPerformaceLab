import { healthRouter } from './routers/health';
import { createCallerFactory, createTRPCRouter } from './trpc';

/**
 * Root router — the API's single composition point.
 *
 * Each feature slice owns a router under `src/features/<slice>/server/router.ts`
 * and registers it here. Nothing else in the app imports feature routers
 * directly, so the API surface is fully described by this file.
 *
 * Only `health` exists today; feature routers are added as slices are built.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
});

export type AppRouter = typeof appRouter;

/**
 * Server-side caller. Lets a Server Component or a Server Action invoke a
 * procedure directly — no HTTP round-trip, same validation and authorization.
 */
export const createCaller = createCallerFactory(appRouter);
