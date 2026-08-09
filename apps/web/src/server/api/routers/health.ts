import { createTRPCRouter, publicProcedure } from '../trpc';

/**
 * Health router.
 *
 * Serves as the reference implementation of the router pattern and as a real
 * liveness probe for deployment checks. Feature routers follow the same shape.
 */
export const healthRouter = createTRPCRouter({
  ping: publicProcedure.query(() => ({
    status: 'ok' as const,
    timestamp: new Date(),
  })),

  /** Verifies the database is reachable — used by the readiness endpoint. */
  database: publicProcedure.query(async ({ ctx }) => {
    const start = Date.now();
    await ctx.db.$queryRaw`SELECT 1`;

    return {
      status: 'ok' as const,
      latencyMs: Date.now() - start,
    };
  }),
});
