'use server';

import { db } from '@apex/database';

import { grantSharePass } from './share-access';
import { resolveShare, verifySharePassword } from './sharing';

/**
 * Checking the password of a shared link.
 *
 * A server action rather than a route: it needs no session, writes only a
 * cookie, and belongs to the page it serves.
 *
 * **One answer for every failure.** A wrong password, a revoked link, an
 * expired one and a token that never existed all return the same thing. Telling
 * them apart here would turn the form into an oracle: a stranger with a
 * half-remembered link could learn whether it is real.
 */
export async function unlockShareAction(token: string, password: string): Promise<{ ok: boolean }> {
  const share = await resolveShare(db, token);

  if (!share?.active || share.passwordHash === null) return { ok: false };

  const correct = await verifySharePassword(password, share.passwordHash);
  if (!correct) return { ok: false };

  await grantSharePass(share.id, share.passwordHash, share.expiresAt);

  return { ok: true };
}
