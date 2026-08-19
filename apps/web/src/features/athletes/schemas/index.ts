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
 * The same field on an update, where an emptied input means "remove this".
 *
 * Create and update need different answers to the same empty string. On create
 * there is nothing to remove, so absence and emptiness coincide. On update they
 * are different intentions: a field the form never sent must stay untouched,
 * and a field the coach cleared must be written back as `null`.
 *
 * Collapsing both to `undefined` — which is what the create schema does — made
 * clearing impossible: the service skips `undefined`, so a mistyped email or
 * weight could be corrected but never removed.
 */
const clearableText = <TSchema extends z.ZodType<string>>(schema: TSchema) =>
  z
    // `null` is accepted on the way in as well as produced on the way out. A
    // tRPC procedure is typed by its schema's *input*, and an action re-sends
    // the parsed value — so a shape that only emitted `null` could not be fed
    // back through `api.athletes.update`.
    .union([schema, z.literal(''), z.null()])
    .transform((value) => (value === '' || value === null ? null : value))
    .optional();

/** Plausibility bounds, in the units the columns are declared in. */
const HEIGHT_CM = { min: 30, max: 300 } as const;
const WEIGHT_KG = { min: 10, max: 500 } as const;

/**
 * A decimal figure from a form field.
 *
 * Three things a plain `z.coerce.number()` gets wrong here:
 *
 * 1. **An empty input is not zero.** `Number('')` is `0`, which would silently
 *    record a weight of nothing rather than no weight at all.
 * 2. **A German keyboard types `78,5`.** The product ships in German, so the
 *    decimal comma is the ordinary input, not a mistake to reject.
 * 3. **Bounds are validation, not decoration.** A height of 1.82 — metres typed
 *    into a centimetre field — is the mistake this actually catches.
 *
 * `absent` is what an emptied field becomes: `undefined` on create, `null` on
 * update, for the reason given on `clearableText`.
 */
function measureField<TAbsent extends null | undefined>(
  { min, max }: { readonly min: number; readonly max: number },
  unit: string,
  absent: TAbsent,
) {
  return (
    z
      // `null` is accepted on the way in as well as produced on the way out: a
      // tRPC procedure is typed by its schema's *input*, and the update action
      // re-sends the parsed value.
      .union([z.number(), z.string(), z.null()])
      .transform((value, ctx): number | TAbsent => {
        if (value === null) return absent;
        if (typeof value === 'string' && value.trim() === '') return absent;

        const parsed = typeof value === 'number' ? value : Number(value.trim().replace(',', '.'));

        if (!Number.isFinite(parsed)) {
          ctx.addIssue({ code: 'custom', message: 'Bitte eine Zahl eingeben.' });

          return z.NEVER;
        }

        if (parsed < min || parsed > max) {
          ctx.addIssue({
            code: 'custom',
            message: `Bitte einen Wert zwischen ${String(min)} und ${String(max)} ${unit} eingeben.`,
          });

          return z.NEVER;
        }

        // Two decimals, matching `Decimal(5,2)`. Rounding here rather than at the
        // database keeps what was validated and what is stored the same number.
        return Math.round(parsed * 100) / 100;
      })
      // `.optional()` last, for the same reason as `optionalText`: with the order
      // reversed the transform makes the key required-but-possibly-undefined, and
      // every caller has to spell out fields it does not have.
      .optional()
  );
}

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
  heightCm: measureField(HEIGHT_CM, 'cm', undefined),
  weightKg: measureField(WEIGHT_KG, 'kg', undefined),

  /**
   * Set once the coach has seen the duplicate warning and chosen to go on (§7).
   *
   * A flag rather than a separate "check duplicates" procedure: the check then
   * cannot be skipped by a caller that forgets to make it. The default is the
   * safe one, so an API client that has never heard of duplicates still gets
   * warned rather than silently creating a second record.
   *
   * `'1'` is what a submit button contributes to `FormData`; `true` is what the
   * parsed value is re-sent as.
   */
  confirmDuplicate: z
    .union([z.boolean(), z.literal('1'), z.literal('')])
    .optional()
    .transform((value) => value === true || value === '1'),
});

export type CreateAthleteInput = z.infer<typeof createAthleteSchema>;

/**
 * Update, spelled out rather than derived from the create schema.
 *
 * `createAthleteSchema.partial()` was the previous shape and it could not
 * express clearing: every optional field collapsed an emptied input to
 * `undefined`, which the service reads as "not sent" and skips. The two schemas
 * genuinely differ, so they are written separately (§2) — the names stay
 * non-empty when present, because an athlete without a name is not a state this
 * product has.
 */
export const updateAthleteSchema = z.object({
  athleteId: z.string().min(1),
  firstName: z.string().trim().min(1, 'Bitte einen Vornamen eingeben.').max(100).optional(),
  lastName: z.string().trim().min(1, 'Bitte einen Nachnamen eingeben.').max(100).optional(),
  dateOfBirth: clearableText(z.iso.date('Bitte ein gültiges Datum eingeben.')),
  email: clearableText(z.email('Bitte eine gültige E-Mail-Adresse eingeben.')),
  phone: clearableText(z.string().trim().max(50)),
  heightCm: measureField(HEIGHT_CM, 'cm', null),
  weightKg: measureField(WEIGHT_KG, 'kg', null),
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
