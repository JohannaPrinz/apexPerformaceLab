import 'server-only';

import { TRPCError } from '@trpc/server';

/**
 * The read-only state of a deactivated portal account (§21).
 *
 * A deactivated athlete keeps their access and loses every write — the reason
 * is in §21 and it is not a UI decision, so it is enforced in the procedures
 * that write rather than by hiding controls.
 *
 * Its own module because two routers need it: tracking and files. One copy, so
 * a rule that changes changes once.
 */
export const READ_ONLY =
  'Ihr Zugang ist auf Lesen gestellt. Sie können Ihre Daten weiterhin ansehen und herunterladen.';

/** Refuses a write from a deactivated athlete, and answers why. */
export function writable(athlete: { readonly archivedAt: Date | null }): void {
  if (athlete.archivedAt !== null) {
    throw new TRPCError({ code: 'FORBIDDEN', message: READ_ONLY });
  }
}
