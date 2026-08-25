import 'server-only';

import { TRPCError } from '@trpc/server';

import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';

import { listBleedingSchema, recordBleedingSchema, removeBleedingSchema } from '../schemas';

import { listBleeding, recordBleeding, removeBleeding } from './service';

/**
 * Cycle tracking.
 *
 * ## Its own router, not part of `assessments`
 *
 * The separation is the point: nothing here reads or writes an Assessment, and
 * putting it under that router would make the independence a convention rather
 * than a structure.
 *
 * ## Permissions
 *
 * `athlete:read` and `athlete:write`, reused rather than invented. A documented
 * bleeding is part of an athlete's record, and anyone who may edit that record
 * may record one; a new permission would be a new access decision that the
 * access model (§21) has not taken.
 *
 * ## The athlete's own entry
 *
 * `recordedBy` is a parameter of the service precisely so the athlete's own
 * path can be added without touching the data model. It is not exposed here:
 * the athlete portal has no authorization path yet (§21, `features/portal`),
 * and a procedure that trusted a client-supplied author would be exactly the
 * hole that path exists to close.
 */
export const cycleRouter = createTRPCRouter({
  /**
   * One athlete's documented bleedings.
   *
   * Episodes, in order. No cycle length, no phase, no prediction — the record
   * holds what was observed.
   */
  list: withPermission('athlete:read')
    .input(listBleedingSchema)
    .query(async ({ ctx, input }) => {
      const episodes = await listBleeding(ctx.db, ctx.tenant, input);
      if (episodes === null) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Athlet nicht gefunden.' });
      }

      return episodes;
    }),

  /**
   * Records a bleeding on behalf of the athlete.
   *
   * `withCoachPermission` because authorship is stored: the coach is taken from
   * the session, never from the request.
   */
  record: withCoachPermission('athlete:write')
    .input(recordBleedingSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await recordBleeding(ctx.db, ctx.tenant, input, {
        recordedBy: 'COACH',
        coachId: ctx.coach.id,
      });

      if (!result.ok) {
        throw new TRPCError({
          code: result.reason === 'ATHLETE_NOT_FOUND' ? 'NOT_FOUND' : 'CONFLICT',
          message:
            result.reason === 'ATHLETE_NOT_FOUND'
              ? 'Athlet nicht gefunden.'
              : 'Für diesen Tag ist bereits eine Blutung dokumentiert.',
        });
      }

      return result.episode;
    }),

  /**
   * Removes an entry.
   *
   * Deletable, unlike a Measurement: a self-recorded date entered on the wrong
   * day is a slip, not a finding that has to survive in a supersede chain.
   */
  remove: withPermission('athlete:write')
    .input(removeBleedingSchema)
    .mutation(async ({ ctx, input }) => {
      const { ok } = await removeBleeding(ctx.db, ctx.tenant, input);
      if (!ok) throw new TRPCError({ code: 'NOT_FOUND', message: 'Eintrag nicht gefunden.' });

      return { ok };
    }),
});
