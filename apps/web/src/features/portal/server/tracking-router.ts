import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { athleteProcedure } from '@/server/api/trpc';
import {
  biofeedbackWeek,
  clearBiofeedbackValue,
  setBiofeedbackNote,
  setBiofeedbackValue,
} from '@/services/tracking/biofeedback';
import { bleedingMonth, removeBleeding, setBleedingDay } from '@/services/tracking/cycle';
import {
  clearNutritionValue,
  nutritionWeek,
  setNutritionValue,
} from '@/services/tracking/nutrition';

import { writable } from './writable';

/**
 * What an athlete may read and write about themselves (§21).
 *
 * ## The one rule this file exists to keep
 *
 * **No procedure here takes an athlete.** Every one of them reads `ctx.athlete`,
 * which `athleteProcedure` resolved from the session. There is therefore nothing
 * in any request that decides whose record is touched — not a parameter to
 * validate, not a comparison to remember, and no way for athlete A to reach
 * athlete B by editing a payload.
 *
 * The entry-addressed writes (`clearValue`, `setNote`, `removeBleeding`) take an
 * id that *is* client-supplied, and that is exactly why they pass the athlete
 * down as an owner: the service puts it in the `where`, so an id belonging to
 * somebody else matches no row rather than being reached across.
 *
 * ## Why the services are shared and the procedures are not
 *
 * The rules about a tracking entry — one value per day, a self-report is
 * deletable, the scale of a rating — are the same whoever writes it, and two
 * copies of them would drift. What must not be shared is the **authorization**:
 * the coach's procedures grant "every athlete in this workspace", which is right
 * for a coach and wrong here. So the services are reused as they stand, with no
 * permission loosened anywhere, and this file is the second, narrower door.
 *
 * ## Read-only after deactivation
 *
 * A deactivated athlete keeps access and loses every write (§21). `writable`
 * enforces that in the procedure, never by hiding a button.
 */

/** The author every write here records. Never taken from the request. */
const AS_ATHLETE = { by: 'ATHLETE' as const, coachId: null };

const notFound = () => new TRPCError({ code: 'NOT_FOUND', message: 'Nicht gefunden.' });

/** A catalogue key, in the shape the catalogue guarantees. */
const measurementTypeKey = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_]+$/);

const entryId = z.string().min(1).max(64);

export const portalTrackingProcedures = {
  /** The week's nutrition table, for the athlete asking. */
  nutritionWeek: athleteProcedure
    .input(z.object({ weekStart: z.date() }))
    .query(async ({ ctx, input }) => {
      const week = await nutritionWeek(ctx.db, ctx.tenant, ctx.athlete.id, input.weekStart);
      if (week === null) throw notFound();

      return week;
    }),

  setNutritionValue: athleteProcedure
    .input(
      z.object({
        measurementTypeKey,
        day: z.date(),
        value: z.number().finite().min(0).max(100000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      writable(ctx.athlete);

      const result = await setNutritionValue(ctx.db, ctx.tenant, AS_ATHLETE, {
        ...input,
        athleteId: ctx.athlete.id,
      });

      if (!result.ok) throw notFound();

      return result;
    }),

  clearNutritionValue: athleteProcedure
    .input(z.object({ entryId }))
    .mutation(async ({ ctx, input }) => {
      writable(ctx.athlete);

      const ok = await clearNutritionValue(ctx.db, ctx.tenant, input.entryId, ctx.athlete.id);
      if (!ok) throw notFound();

      return { ok: true };
    }),

  /** The week's biofeedback table, for the athlete asking. */
  biofeedbackWeek: athleteProcedure
    .input(z.object({ weekStart: z.date() }))
    .query(async ({ ctx, input }) => {
      const week = await biofeedbackWeek(ctx.db, ctx.tenant, ctx.athlete.id, input.weekStart);
      if (week === null) throw notFound();

      return week;
    }),

  setBiofeedbackValue: athleteProcedure
    .input(
      z.object({
        measurementTypeKey,
        day: z.date(),
        value: z.number().finite().min(0).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      writable(ctx.athlete);

      const result = await setBiofeedbackValue(ctx.db, ctx.tenant, AS_ATHLETE, {
        ...input,
        athleteId: ctx.athlete.id,
      });

      if (!result.ok) {
        if (result.refusal === 'OUT_OF_SCALE') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Der Wert liegt außerhalb der Skala dieser Messgröße.',
          });
        }

        throw notFound();
      }

      return result;
    }),

  /** The remark explaining one value — why the night was three hours long. */
  setBiofeedbackNote: athleteProcedure
    .input(z.object({ entryId, note: z.string().trim().max(500).nullable() }))
    .mutation(async ({ ctx, input }) => {
      writable(ctx.athlete);

      const ok = await setBiofeedbackNote(
        ctx.db,
        ctx.tenant,
        input.entryId,
        input.note,
        ctx.athlete.id,
      );

      if (!ok) throw notFound();

      return { ok: true };
    }),

  clearBiofeedbackValue: athleteProcedure
    .input(z.object({ entryId }))
    .mutation(async ({ ctx, input }) => {
      writable(ctx.athlete);

      const ok = await clearBiofeedbackValue(ctx.db, ctx.tenant, input.entryId, ctx.athlete.id);
      if (!ok) throw notFound();

      return { ok: true };
    }),

  /** The month's calendar, for the athlete asking. */
  cycleMonth: athleteProcedure
    .input(z.object({ month: z.iso.date() }))
    .query(async ({ ctx, input }) => {
      const month = await bleedingMonth(
        ctx.db,
        ctx.tenant,
        ctx.athlete.id,
        new Date(`${input.month}T00:00:00.000Z`),
      );

      if (month === null) throw notFound();

      return month;
    }),

  /**
   * Marks one day, or clears it.
   *
   * The author is `ATHLETE` and is not negotiable from the request — which is
   * the whole reason this procedure exists rather than the coach's one being
   * opened up.
   */
  setBleedingDay: athleteProcedure
    .input(
      z.object({
        day: z.iso.date(),
        intensity: z.enum(['SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY']).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      writable(ctx.athlete);

      const result = await setBleedingDay(
        ctx.db,
        ctx.tenant,
        { ...input, athleteId: ctx.athlete.id },
        { recordedBy: 'ATHLETE', coachId: null },
      );

      if (!result.ok) {
        throw new TRPCError({
          code: result.reason === 'ATHLETE_NOT_FOUND' ? 'NOT_FOUND' : 'CONFLICT',
          message:
            result.reason === 'ATHLETE_NOT_FOUND'
              ? 'Nicht gefunden.'
              : 'Dieser Tag gehört zu einem mehrtägigen Eintrag. Der Eintrag lässt sich nur im Ganzen entfernen.',
        });
      }

      return { ok: true };
    }),

  removeBleeding: athleteProcedure
    .input(z.object({ episodeId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      writable(ctx.athlete);

      const { ok } = await removeBleeding(ctx.db, ctx.tenant, input, ctx.athlete.id);
      if (!ok) throw notFound();

      return { ok };
    }),
};
