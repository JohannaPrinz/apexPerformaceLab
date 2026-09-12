/**
 * How a password-reset link reaches the person who asked for it.
 *
 * ## Why this is a seam and not a call
 *
 * Better Auth wants a `sendResetPassword` callback in its configuration, and
 * that configuration lives here. Sending mail lives in the web app — it is an
 * integration with an SMTP account, it reads the app's environment, and it is
 * `server-only`. A package must not import an app, so the callback cannot reach
 * it directly.
 *
 * So the package states *what* has to be delivered and the app says *how*. The
 * app registers its sender once, on the module that serves Better Auth's own
 * endpoints, which is the only path a reset request can arrive by.
 *
 * ## Why it refuses rather than returning quietly
 *
 * A reset that silently sends nothing is the worst outcome available: the
 * person is told to check their inbox, nothing arrives, and no trace is left.
 * An unregistered sender is a wiring mistake, not a runtime condition, and it
 * throws — Better Auth surfaces that to the caller, and the screen says the
 * mail could not be sent instead of claiming it was.
 */

/** What the app needs in order to write and send the message. */
export interface PasswordResetDelivery {
  readonly to: string;
  /** The account's name, for the greeting. May be empty. */
  readonly name: string;
  /** The page that accepts the new password, token included. */
  readonly url: string;
  readonly expiresAt: Date;
}

export type PasswordResetSender = (delivery: PasswordResetDelivery) => Promise<void>;

let sender: PasswordResetSender | null = null;

/**
 * Names the function that actually sends.
 *
 * Called once, at import time, by the module that mounts Better Auth's HTTP
 * handler. Registering twice replaces the previous one, which is what a hot
 * reload in development needs.
 */
export function registerPasswordResetSender(next: PasswordResetSender): void {
  sender = next;
}

/** Hands one reset message over, or says plainly that nothing is wired up. */
export async function deliverPasswordReset(delivery: PasswordResetDelivery): Promise<void> {
  if (sender === null) {
    throw new Error(
      'No password-reset sender is registered. `registerPasswordResetSender` must run before a reset can be requested.',
    );
  }

  await sender(delivery);
}

/**
 * How long a reset link stays open.
 *
 * One hour. Short because the link *is* the credential for that hour and it
 * sits in a mailbox; long enough that somebody who reads mail on a phone and
 * goes back to a laptop still gets in. Better Auth's own default is the same,
 * and it is stated here so the message can name the deadline without guessing
 * what the library does.
 */
export const RESET_TOKEN_SECONDS = 60 * 60;
