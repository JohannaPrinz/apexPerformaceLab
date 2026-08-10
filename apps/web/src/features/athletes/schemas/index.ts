import { z } from 'zod';

import { paginationInputSchema } from '@apex/types';

/**
 * The athlete slice's input contract.
 *
 * **No schema here accepts an `organizationId`.** The tenant scope is derived
 * from the session in `organizationProcedure` and merged in by the service; a
 * client-supplied one would be an IDOR by construction — see
 * docs/SECURITY.md §4.
 *
 * Nor does any schema accept `createdByCoachId`. Authorship is taken from the
 * signed-in coach, never from the request.
 */

/**
 * An untouched optional form field arrives as an empty string, which means
 * absence — not a value of `""`.
 *
 * Normalising it here rather than in the service keeps the decision at the
 * boundary where it belongs: what the browser sends is a parsing concern, and
 * the service should receive a value that is either present or absent, with no
 * third state to remember.
 */
const optionalText = <TSchema extends z.ZodType<string>>(schema: TSchema) =>
  z
    .union([schema, z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    // `.optional()` last, so the key stays optional on the inferred type. With
    // the order reversed the transform makes it required-but-possibly-undefined,
    // and every caller has to spell out fields it does not have.
    .optional();

/**
 * Only the name is required.
 *
 * The default case is an athlete without an account and often without contact
 * details (§21 Shared Access) — a coach entering someone during a first
 * consultation may know nothing else. Demanding an email would make the
 * commonest path the awkward one.
 */
export const createAthleteSchema = z.object({
  firstName: z.string().trim().min(1, 'Please enter a first name.').max(100),
  lastName: z.string().trim().min(1, 'Please enter a last name.').max(100),
  dateOfBirth: optionalText(z.iso.date('Please enter a valid date.')),
  email: optionalText(z.email('Please enter a valid email address.')),
  phone: optionalText(z.string().trim().max(50)),
});

export type CreateAthleteInput = z.infer<typeof createAthleteSchema>;

export const updateAthleteSchema = createAthleteSchema.partial().extend({
  athleteId: z.string().min(1),
});

export type UpdateAthleteInput = z.infer<typeof updateAthleteSchema>;

/**
 * Roster query.
 *
 * `includeArchived` defaults to false: an archived athlete is not deleted (§22)
 * but does not belong in the working roster either.
 */
export const listAthletesSchema = paginationInputSchema.extend({
  search: z.string().trim().max(100).optional(),
  includeArchived: z.boolean().default(false),
});

export type ListAthletesInput = z.infer<typeof listAthletesSchema>;

export const athleteIdSchema = z.object({
  athleteId: z.string().min(1),
});

export type AthleteIdInput = z.infer<typeof athleteIdSchema>;

/** Archiving is reversible, so one procedure carries both directions (§22). */
export const setAthleteArchivedSchema = athleteIdSchema.extend({
  archived: z.boolean(),
});

export type SetAthleteArchivedInput = z.infer<typeof setAthleteArchivedSchema>;
