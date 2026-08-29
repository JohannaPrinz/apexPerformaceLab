import { z } from 'zod';

/**
 * Access to a finished document — never a state of the document itself (§17).
 *
 * ## Two lifecycles, and why they stay apart
 *
 * A Report is content: draft, published, archived. A Share is permission to
 * read it: granted, and then either withdrawn or run out. Folding the second
 * into the first would mean that revoking a link changed the document, and a
 * document that changes when somebody loses access is not a record.
 *
 * ## The state is derived, never stored
 *
 * Two causes end a share — the coach withdrew it, or the time ran out — and
 * both produce the same terminal state. A stored `status` column would need a
 * job to keep it true and would be wrong between runs of that job. Computed
 * from `revokedAt` and `expiresAt`, it is never wrong.
 *
 * Expired shares are not deleted. Who had access, and until when, is part of
 * the record.
 */

export const SHARE_STATES = ['ACTIVE', 'REVOKED', 'EXPIRED'] as const;
export type ShareState = (typeof SHARE_STATES)[number];

export interface ShareTimes {
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

/**
 * What a share is right now.
 *
 * Withdrawal is reported ahead of expiry where both apply: a coach who pulled a
 * link back should read "zurückgezogen", not "abgelaufen" — the first is
 * something they did, the second something that happened.
 */
export function shareState(share: ShareTimes, now: Date = new Date()): ShareState {
  if (share.revokedAt !== null) return 'REVOKED';
  if (share.expiresAt !== null && share.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';

  return 'ACTIVE';
}

export const isShareActive = (share: ShareTimes, now?: Date): boolean =>
  shareState(share, now) === 'ACTIVE';

/**
 * How long a link lasts unless somebody says otherwise.
 *
 * Five days: long enough for an athlete who reads mail at the weekend, short
 * enough that a forwarded link stops working before it is forgotten about.
 */
export const DEFAULT_SHARE_DAYS = 5;
export const MIN_SHARE_DAYS = 1;
export const MAX_SHARE_DAYS = 30;

export const shareDaysSchema = z
  .number()
  .int()
  .min(MIN_SHARE_DAYS)
  .max(MAX_SHARE_DAYS)
  .default(DEFAULT_SHARE_DAYS);

/** When a link granted now would stop working. */
export function shareExpiryFrom(days: number, now: Date = new Date()): Date {
  const expiry = new Date(now.getTime());
  expiry.setUTCDate(expiry.getUTCDate() + days);

  return expiry;
}

/**
 * How many days are left, for a sentence a person reads.
 *
 * Rounded **up**: a link granted for five days must say "five days" a second
 * later, not "four". Flooring is arithmetically tidier and was measured to read
 * as a mistake — the coach picks 5 and the athlete is told 4.
 *
 * Whether the link still works is not decided here. `shareState` answers that
 * from the moment itself, so a number rounded for a sentence can never keep a
 * dead link alive.
 */
export function shareDaysLeft(expiresAt: Date | null, now: Date = new Date()): number | null {
  if (expiresAt === null) return null;

  return Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
}
