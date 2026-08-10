import 'server-only';

import { TRPCError } from '@trpc/server';

import { AppError } from '@apex/types';

import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';

import { caseIdSchema, createCaseSchema, listCasesSchema, setCaseStatusSchema } from '../schemas';

import { createCase, getCase, listCasesForAthlete, setCaseStatus } from './service';

const notFound = (resource: 'Athlete' | 'Performance case') =>
  new TRPCError({
    code: 'NOT_FOUND',
    message: `${resource} not found.`,
    cause: AppError.notFound(resource),
  });

export const casesRouter = createTRPCRouter({
  /** The cases of one athlete. The athlete filter is itself tenant-scoped. */
  listForAthlete: withPermission('case:read')
    .input(listCasesSchema)
    .query(({ ctx, input }) => listCasesForAthlete(ctx.db, ctx.tenant, input)),

  byId: withPermission('case:read')
    .input(caseIdSchema)
    .query(async ({ ctx, input }) => {
      const performanceCase = await getCase(ctx.db, ctx.tenant, input.caseId);
      if (!performanceCase) throw notFound('Performance case');

      return performanceCase;
    }),

  create: withCoachPermission('case:write')
    .input(createCaseSchema)
    .mutation(async ({ ctx, input }) => {
      const performanceCase = await createCase(ctx.db, ctx.tenant, ctx.coach.id, input);
      // `null` means the athlete is not in this workspace — reported as a
      // missing athlete, never as forbidden, which would confirm it exists.
      if (!performanceCase) throw notFound('Athlete');

      return performanceCase;
    }),

  setStatus: withPermission('case:write')
    .input(setCaseStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const performanceCase = await setCaseStatus(ctx.db, ctx.tenant, input.caseId, input.status);
      if (!performanceCase) throw notFound('Performance case');

      return performanceCase;
    }),
});
