import { z } from 'zod';

/**
 * Branded ID types.
 *
 * A bare `string` lets an `organizationId` be passed where a `userId` is
 * expected — in a multi-tenant system that class of mistake is a data leak, not
 * a typo. Branding makes the compiler reject it at zero runtime cost.
 */
declare const brand: unique symbol;
export type Brand<TValue, TBrand extends string> = TValue & { readonly [brand]: TBrand };

export type UserId = Brand<string, 'UserId'>;
export type OrganizationId = Brand<string, 'OrganizationId'>;
export type AthleteId = Brand<string, 'AthleteId'>;

export const cuidSchema = z.cuid2();
export const uuidSchema = z.uuid();
export const emailSchema = z.email().trim().toLowerCase();

/** URL-safe identifier used for tenant subdomains and public resource paths. */
export const slugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be lowercase alphanumeric with single hyphens');

export const isoDateSchema = z.iso.datetime({ offset: true });

/** ISO 8601 calendar date without a time component (`YYYY-MM-DD`). */
export const calendarDateSchema = z.iso.date();

export type Slug = z.infer<typeof slugSchema>;
export type IsoDate = z.infer<typeof isoDateSchema>;
export type CalendarDate = z.infer<typeof calendarDateSchema>;
