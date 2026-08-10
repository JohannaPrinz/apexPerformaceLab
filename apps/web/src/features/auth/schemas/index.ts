import { z } from 'zod';

/**
 * Credential form contracts.
 *
 * These validate the *form*, not the account. Better Auth owns the account
 * rules — the minimum length below has to match `minPasswordLength` in
 * `packages/auth/src/server.ts`, or the client accepts a password the server
 * then rejects with a less helpful message.
 */

/** Mirrors `emailAndPassword.minPasswordLength` in the Better Auth config. */
export const MIN_PASSWORD_LENGTH = 12;

export const signUpSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(100, 'That name is too long.'),
  email: z.email('Please enter a valid email address.'),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(128, 'That password is too long.'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.email('Please enter a valid email address.'),
  password: z.string().min(1, 'Please enter your password.'),
});

export type SignInInput = z.infer<typeof signInSchema>;
