import 'server-only';

import { TRPCError } from '@trpc/server';

import { AppError } from '@apex/types';

import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';

import {
  caseIdSchema,
  createCaseSchema,
  listCasesSchema,
  setCaseStatusSchema,
  updateCaseSchema,
} from '../schemas';

import { createCase, getCase, listCasesForAthlete, setCaseStatus, updateCase } from './service';

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

  /**
   * Corrects a case. Status has its own procedure and its own transitions.
   */
  update: withPermission('case:write')
    .input(updateCaseSchema)
    .mutation(async ({ ctx, input }) => {
      const updated = await updateCase(ctx.db, ctx.tenant, input);
      if (!updated) throw notFound('Performance case');

      return updated;
    }),

  setStatus: withPermission('case:write')
    .input(setCaseStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const performanceCase = await setCaseStatus(ctx.db, ctx.tenant, input.caseId, input.status);
      if (!performanceCase) throw notFound('Performance case');

      return performanceCase;
    }),
});
