import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

import { env } from '@/env';

/**
 * Remembering that somebody got the password right.
 *
 * ## Why a cookie has to be signed
 *
 * The token is in the address bar, so anybody holding the link can reach the
 * page. What separates them from the athlete is the password — and if "I already
 * typed it" were an unsigned cookie, it would be a value anyone could set. The
 * cookie therefore carries an HMAC over the share id and the stored password
 * hash, keyed with the server secret.
 *
 * Binding it to the **hash** rather than to the id alone has a useful
 * consequence: a link whose password is changed invalidates every pass issued
 * before it, without anything having to remember to clear them.
 *
 * ## Why it is per share
 *
 * One cookie per share, named after the share. An athlete who is given two
 * links needs two passwords, and a single "unlocked" flag would hand them the
 * second for free.
 */

const PREFIX = 'apex_share_';

/** As long as a share can last, capped — the share's own expiry decides first. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function sign(shareId: string, passwordHash: string): string {
  return createHmac('sha256', env.BETTER_AUTH_SECRET)
    .update(`${shareId}:${passwordHash}`)
    .digest('base64url');
}

const nameFor = (shareId: string) => `${PREFIX}${shareId}`;

/** Whether this browser has already answered for this share. */
export async function hasSharePass(shareId: string, passwordHash: string): Promise<boolean> {
  const store = await cookies();
  const found = store.get(nameFor(shareId))?.value;
  if (found === undefined) return false;

  const expected = sign(shareId, passwordHash);
  const a = Buffer.from(found);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Records that the password was right.
 *
 * `httpOnly` so no script can read it, `sameSite: lax` so following the link
 * from an email still works, and `secure` outside development because this
 * cookie is the whole of the athlete's authorisation.
 */
export async function grantSharePass(
  shareId: string,
  passwordHash: string,
  expiresAt: Date | null,
): Promise<void> {
  const store = await cookies();
  const remaining =
    expiresAt === null
      ? MAX_AGE_SECONDS
      : Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

  store.set(nameFor(shareId), sign(shareId, passwordHash), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/geteilt',
    maxAge: Math.min(remaining, MAX_AGE_SECONDS),
  });
}
