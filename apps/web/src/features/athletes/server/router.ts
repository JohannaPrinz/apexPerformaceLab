import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

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
  countAthletes,
  createAthlete,
  findAthleteDuplicates,
  listRecentAthletes,
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

  /**
   * The workspace overview's two figures and its shortcut list.
   *
   * One procedure rather than three: the overview always wants all of it, and a
   * page that fires three round trips for one screen is three chances to be
   * half-rendered. Same permission and same tenant scope as the roster.
   */
  overview: withPermission('athlete:read')
    .input(z.object({ limit: z.number().int().min(1).max(12).default(6) }).optional())
    .query(async ({ ctx, input }) => {
      const [counts, recent] = await Promise.all([
        countAthletes(ctx.db, ctx.tenant),
        listRecentAthletes(ctx.db, ctx.tenant, input?.limit ?? 6),
      ]);

      return { counts, recent };
    }),

  byId: withPermission('athlete:read')
    .input(athleteIdSchema)
    .query(async ({ ctx, input }) => {
      const athlete = await getAthlete(ctx.db, ctx.tenant, input.athleteId);
      if (!athlete) throw notFound();

      return athlete;
    }),

  /**
   * Creates an athlete, warning about likely duplicates first (§7).
   *
   * The check lives **inside** the mutation rather than in a procedure the
   * client is expected to call beforehand: a caller that forgets the second
   * call would silently create the duplicate, and the safe path should not
   * depend on remembering anything.
   *
   * It returns a result rather than throwing. A duplicate is not an error — the
   * coach may well be entering twins, or the same name twice on purpose — so
   * the answer is "here is what I found, say the word", and `confirmDuplicate`
   * is that word.
   */
  create: withCoachPermission('athlete:write')
    .input(createAthleteSchema)
    .mutation(async ({ ctx, input }) => {
      if (!input.confirmDuplicate) {
        const candidates = await findAthleteDuplicates(ctx.db, ctx.tenant, input);

        if (candidates.length > 0) return { status: 'duplicates' as const, candidates };
      }

      return {
        status: 'created' as const,
        athlete: await createAthlete(ctx.db, ctx.tenant, ctx.coach.id, input),
      };
    }),

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
