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

type ShareDb = Pick<PrismaClientInstance, 'share' | 'report' | 'athlete'>;

export interface CreatedShare {
  readonly id: string;
  readonly token: string;
  /** Shown once, here, and never again — only its hash is kept. */
  readonly password: string;
  readonly expiresAt: Date;
  /** The athlete's current address, or `null` where none is on file. */
  readonly recipient: string | null;
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
  /**
   * The password the coach chose.
   *
   * Chosen rather than generated: the coach is the one who has to pass it on,
   * by whatever channel they and the athlete already use, and a string they
   * picked is one they can say out loud. Only its hash is stored either way —
   * see below — so nothing about that changes.
   */
  password: string,
  /**
   * An address for an athlete who has none on file.
   *
   * The ordinary athlete is entered during a first consultation, about whom
   * little is known and often not an address (§7). The moment one is needed is
   * this one — and it is also the moment the coach knows it.
   */
  email?: string,
): Promise<CreatedShare | null> {
  const report = await db.report.findFirst({
    where: scoped(tenant, { id: reportId, status: 'PUBLISHED' as const }),
    select: {
      id: true,
      /**
       * Where the message goes, read **now** rather than from the document.
       *
       * The snapshot froze who the athlete was on the day it was published; an
       * address they have since changed is still the address they read. One is
       * a record, the other is a destination.
       */
      assessment: {
        select: { case: { select: { athlete: { select: { id: true, email: true } } } } },
      },
    },
  });

  if (!report) return null;

  /**
   * An address typed here is kept, not spent.
   *
   * Using it for this one message and forgetting it would mean asking for it
   * again to activate the portal, where it is the precondition (§21). So it is
   * written to the record — and only ever filled in, never overwritten: a
   * stored address is the athlete's own, and a slip in this box must not
   * replace it. `updateMany` with the tenant and `email: null` in the filter
   * makes both of those a condition of the write rather than a check before it.
   */
  const athlete = report.assessment?.case.athlete ?? null;
  let recipient = athlete?.email ?? null;

  if (recipient === null && athlete !== null && email !== undefined) {
    const { count } = await db.athlete.updateMany({
      where: scoped(tenant, { id: athlete.id, email: null }),
      data: { email },
    });

    if (count > 0) recipient = email;
  }

  const token = newShareToken();
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

  return {
    id: share.id,
    token,
    password,
    expiresAt,
    recipient,
  };
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
