import { z } from 'zod';

/**
 * The portal slice's input contract.
 *
 * **No schema here accepts an `organizationId`,** for the same reason as
 * everywhere else: the tenant scope is derived from the session, and a
 * client-supplied one would be an IDOR by construction (docs/SECURITY.md §4).
 *
 * The redemption schema is the one place a request carries something that
 * decides who it is about — the token. That is the point of a token, and
 * `resolveActivation` explains what makes it safe: it is a 256-bit secret
 * looked up by hash, and the workspace comes from the row it finds rather than
 * from anything else in the request.
 */

/**
 * How long a portal password must be.
 *
 * Matches `emailAndPassword.minPasswordLength` in `packages/auth` — Better Auth
 * would refuse a shorter one at sign-in, so the form has to agree with it.
 *
 * It lives here rather than beside the service because the form needs it and
 * `server/activation.ts` is server-only, exactly as `MIN_SHARE_PASSWORD_LENGTH`
 * sits in the reports slice's schemas.
 */
export const MIN_PORTAL_PASSWORD_LENGTH = 12;

export const issueActivationSchema = z.object({
  athleteId: z.string().min(1),
});

export type IssueActivationInput = z.infer<typeof issueActivationSchema>;

export const revokeActivationSchema = issueActivationSchema;

/** Reading what a link opens, before anything is typed into it. */
export const activationTokenSchema = z.object({
  token: z.string().min(1),
});

export const redeemActivationSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(
      MIN_PORTAL_PASSWORD_LENGTH,
      `Bitte mindestens ${MIN_PORTAL_PASSWORD_LENGTH} Zeichen verwenden.`,
    )
    .max(200),
});

export type RedeemActivationInput = z.infer<typeof redeemActivationSchema>;
