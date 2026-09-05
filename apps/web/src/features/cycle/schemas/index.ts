import { z } from 'zod';

import { bleedingIntensitySchema } from '@apex/domain';

/**
 * The cycle slice's input contract.
 *
 * **No schema here accepts an `organizationId`** — the tenant scope comes from
 * the session, never from the request (docs/SECURITY.md §4). Nor does any
 * accept a coach id: authorship is taken from the signed-in coach.
 *
 * What is recorded is a **documented bleeding**, and nothing else. No cycle
 * length, no phase, no fertile window: those are inferences, and this records
 * observations.
 */

/**
 * A calendar day, not an instant.
 *
 * Nobody records a menstruation to the minute, and a timestamp would invite a
 * precision the time zone then quietly changes — a bleeding entered at 23:00 in
 * Berlin would be the previous day in UTC. The column is a `DATE` for the same
 * reason.
 */
const calendarDay = z.iso.date('Bitte ein gültiges Datum eingeben.');

export const recordBleedingSchema = z
  .object({
    athleteId: z.string().min(1),
    /** The first day of bleeding — the one people actually track. */
    startedOn: calendarDay,
    /**
     * The last day, where it is known.
     *
     * Optional because demanding it would make the common entry the awkward
     * one: the first day is usually recorded on the day it happens, when the
     * end is still in the future.
     */
    endedOn: z
      .union([calendarDay, z.literal(''), z.null()])
      .transform((value) => (value === '' || value === null ? null : value))
      .optional(),
    note: z
      .union([z.string().trim().max(1000), z.literal(''), z.null()])
      .transform((value) => (value === '' || value === null ? null : value))
      .optional(),
  })
  .superRefine((input, ctx) => {
    // A bleeding cannot end before it began. Checked here as well as by the
    // database constraint: a form deserves a sentence, not a failed insert.
    if (input.endedOn !== null && input.endedOn !== undefined && input.endedOn < input.startedOn) {
      ctx.addIssue({
        code: 'custom',
        path: ['endedOn'],
        message: 'Das Ende darf nicht vor dem Beginn liegen.',
      });
    }
  });

export type RecordBleedingInput = z.infer<typeof recordBleedingSchema>;

export const listBleedingSchema = z.object({
  athleteId: z.string().min(1),
});

export type ListBleedingInput = z.infer<typeof listBleedingSchema>;

export const removeBleedingSchema = z.object({
  episodeId: z.string().min(1),
});

export type RemoveBleedingInput = z.infer<typeof removeBleedingSchema>;

/**
 * One day of the calendar, marked or cleared.
 *
 * A day rather than a range, because that is what the calendar records: the
 * unique index on (athlete, first day) makes one row per day, and a marked day
 * is a first day that is also the last.
 *
 * `intensity: null` clears the day. The same control that made a mark removes
 * it, so a mistaken click needs no second gesture.
 */
export const setBleedingDaySchema = z.object({
  athleteId: z.string().min(1),
  day: calendarDay,
  intensity: bleedingIntensitySchema.nullable(),
});

export type SetBleedingDayInput = z.infer<typeof setBleedingDaySchema>;

/** One month of it. The day names the month; only its year and month are read. */
export const bleedingMonthSchema = z.object({
  athleteId: z.string().min(1),
  month: calendarDay,
});

export type BleedingMonthInput = z.infer<typeof bleedingMonthSchema>;
