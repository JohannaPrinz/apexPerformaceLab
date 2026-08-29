import 'server-only';

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import { isShareActive, readReportSnapshot, shareExpiryFrom, shareState } from '@apex/domain';
import type { TenantContext } from '@apex/types';

/**
 * Handing a finished analysis to somebody without an account.
 *
 * ## What guards it
 *
 * Two independent things: a token nobody can guess, and a password only the
 * coach and the athlete know. Either alone would be thin — a link is forwarded,
 * a password is reused — and both together mean a leaked mailbox is not enough.
 *
 * ## Why the password is never stored
 *
 * Only a hash is kept, salted per share, so nothing in this system can show a
 * password back to anybody. The coach sees it once, at the moment it is made,
 * and passes it on their own way. That is the whole point: a password sent
 * through the same channel as the link is a key taped to the door.
 *
 * `scrypt` comes with Node. A dependency for this would buy nothing — it is the
 * function the platform already ships for exactly this job, deliberately slow,
 * with a per-share salt.
 *
 * ## Why the comparison is timing-safe
 *
 * A plain `===` on hashes leaks how many bytes matched, one request at a time.
 * `timingSafeEqual` does not. It costs nothing and removes a whole class of
 * attack that is otherwise invisible until somebody uses it.
 */

const scryptAsync = promisify(scrypt);

/** Work factor and length. Node's defaults for N/r/p, with a 64-byte output. */
const KEY_LENGTH = 64;

/**
 * A token nobody guesses.
 *
 * 32 random bytes, base64url so it survives a URL, an address bar and a copy
 * out of an email without escaping. That is 256 bits — the link is unguessable
 * for as long as the universe is around.
 */
export function newShareToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * A password a person can actually read out over the phone.
 *
 * Four short groups of unambiguous characters. No `l`, `1`, `O` or `0`: this
 * gets dictated, and a coach reading "l" while the athlete types "1" is a
 * support call, not a security event.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function newSharePassword(): string {
  const bytes = randomBytes(16);
  const characters = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');

  return [
    characters.slice(0, 4),
    characters.slice(4, 8),
    characters.slice(8, 12),
    characters.slice(12, 16),
  ].join('-');
}

/** `salt:hash`, both hex. One column, no second field to keep in step. */
export async function hashSharePassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH)) as Buffer;

  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

/** Whether a password matches. `false` for anything unreadable, never a throw. */
export async function verifySharePassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (saltHex === undefined || hashHex === undefined) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }

  if (expected.length !== KEY_LENGTH) return false;

  const derived = (await scryptAsync(
    password.normalize('NFKC'),
    Buffer.from(saltHex, 'hex'),
    KEY_LENGTH,
  )) as Buffer;

  return timingSafeEqual(derived, expected);
}

type ShareDb = Pick<PrismaClientInstance, 'share' | 'report'>;

export interface CreatedShare {
  readonly id: string;
  readonly token: string;
  /** Shown once, here, and never again — only its hash is kept. */
  readonly password: string;
  readonly expiresAt: Date;
}

/**
 * Grants access to a published analysis.
 *
 * Refuses a draft outright. A document that is still being written must not be
 * behind a link somebody may open at any moment — §16's publication is the line
 * between "working on it" and "this is what I found".
 */
export async function createReportShare(
  db: ShareDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  reportId: string,
  days: number,
): Promise<CreatedShare | null> {
  const report = await db.report.findFirst({
    where: scoped(tenant, { id: reportId, status: 'PUBLISHED' as const }),
    select: { id: true },
  });

  if (!report) return null;

  const token = newShareToken();
  const password = newSharePassword();
  const expiresAt = shareExpiryFrom(days);

  const share = await db.share.create({
    data: withTenant(tenant, {
      token,
      passwordHash: await hashSharePassword(password),
      expiresAt,
      createdByCoachId,
      reportId,
    }),
    select: { id: true },
  });

  return { id: share.id, token, password, expiresAt };
}

/**
 * Withdraws access without deleting the record of it.
 *
 * The row stays: who had access, and until when, is part of the audit trail
 * (§17). Revoking twice is not an error — the coach's intent is the same both
 * times, and refusing the second would only puzzle them.
 */
export async function revokeShare(
  db: ShareDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  shareId: string,
): Promise<boolean> {
  const { count } = await db.share.updateMany({
    where: scoped(tenant, { id: shareId, revokedAt: null }),
    data: { revokedAt: new Date() },
  });

  return count > 0;
}

export interface ShareSummary {
  readonly id: string;
  readonly state: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

/** Every link ever granted for this analysis, newest first. */
export async function sharesForReport(
  db: ShareDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  reportId: string,
): Promise<ShareSummary[]> {
  const shares = await db.share.findMany({
    where: scoped(tenant, { reportId }),
    select: { id: true, expiresAt: true, revokedAt: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }],
  });

  return shares.map((share) => ({ ...share, state: shareState(share) }));
}

/**
 * Which of an athlete's assessments are currently behind a link.
 *
 * One query for a whole roster page. Only **active** shares count: a link that
 * ran out or was withdrawn is part of the history, not of what the athlete can
 * see right now, and a badge saying otherwise would be a false reassurance in
 * the direction that matters.
 */
export async function sharedAssessmentIds(
  db: Pick<PrismaClientInstance, 'share'>,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
): Promise<string[]> {
  const now = new Date();

  const shares = await db.share.findMany({
    where: scoped(tenant, {
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      report: { assessment: { case: { athleteId } } },
    }),
    select: { report: { select: { assessmentId: true } } },
  });

  return [
    ...new Set(
      shares.flatMap((share) => {
        const id = share.report?.assessmentId;

        return id === undefined || id === null ? [] : [id];
      }),
    ),
  ];
}

/**
 * What lies behind a token — **outside any workspace**.
 *
 * The one read in this system with no tenant in its filter, and it is safe for
 * exactly one reason: the token *is* the authorisation. It is 256 random bits,
 * it names one row, and that row names one document. Nothing here accepts an id
 * from the caller, so there is nothing to enumerate.
 *
 * The password is checked separately, by the caller, so that a wrong password
 * and an expired link give different answers — an athlete needs to know which
 * of the two they are looking at.
 */
export async function resolveShare(db: ShareDb, token: string) {
  if (token.length < 20 || token.length > 128) return null;

  const share = await db.share.findUnique({
    where: { token },
    select: {
      id: true,
      passwordHash: true,
      expiresAt: true,
      revokedAt: true,
      report: {
        select: { id: true, title: true, status: true, content: true, publishedAt: true },
      },
    },
  });

  if (share?.report?.status !== 'PUBLISHED') return null;

  return {
    id: share.id,
    passwordHash: share.passwordHash,
    state: shareState(share),
    active: isShareActive(share),
    expiresAt: share.expiresAt,
    title: share.report.title,
    publishedAt: share.report.publishedAt,
    snapshot: readReportSnapshot(share.report.content),
  };
}
