import 'server-only';

import { TRPCError } from '@trpc/server';

import { AppError } from '@apex/types';

import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';

import {
  athleteIdSchema,
  createAthleteSchema,
  listAthletesSchema,
  setAthleteArchivedSchema,
  updateAthleteSchema,
} from '../schemas';

import {
  createAthlete,
  getAthlete,
  listAthletes,
  setAthleteArchived,
  updateAthlete,
} from './service';

/** A missing athlete and another tenant's athlete are the same answer (§4). */
const notFound = () =>
  new TRPCError({
    code: 'NOT_FOUND',
    message: 'Athlete not found.',
    cause: AppError.notFound('Athlete'),
  });

/**
 * Athlete router.
 *
 * Every procedure is permission-gated and tenant-scoped. `create` uses
 * `withCoachPermission` because the athlete records its author; the others need
 * no coach identity, so they do not pay for the lookup.
 */
export const athletesRouter = createTRPCRouter({
  list: withPermission('athlete:read')
    .input(listAthletesSchema)
    .query(({ ctx, input }) => listAthletes(ctx.db, ctx.tenant, input)),

  byId: withPermission('athlete:read')
    .input(athleteIdSchema)
    .query(async ({ ctx, input }) => {
      const athlete = await getAthlete(ctx.db, ctx.tenant, input.athleteId);
      if (!athlete) throw notFound();

      return athlete;
    }),

  create: withCoachPermission('athlete:write')
    .input(createAthleteSchema)
    .mutation(({ ctx, input }) => createAthlete(ctx.db, ctx.tenant, ctx.coach.id, input)),

  update: withPermission('athlete:write')
    .input(updateAthleteSchema)
    .mutation(async ({ ctx, input }) => {
      const athlete = await updateAthlete(ctx.db, ctx.tenant, input);
      if (!athlete) throw notFound();

      return athlete;
    }),

  /**
   * Archive and restore, not delete. An Athlete is never deleted (§22) — the
   * permission is `athlete:write` for the same reason: this is a reversible
   * state change, not destruction.
   */
  setArchived: withPermission('athlete:write')
    .input(setAthleteArchivedSchema)
    .mutation(async ({ ctx, input }) => {
      const athlete = await setAthleteArchived(ctx.db, ctx.tenant, input.athleteId, input.archived);
      if (!athlete) throw notFound();

      return athlete;
    }),
});
