import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { hashPassword } from 'better-auth/crypto';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import type { TenantContext } from '@apex/types';

import { MIN_PORTAL_PASSWORD_LENGTH } from '../schemas';

/**
 * Turning an existing Athlete into a portal account (§21).
 *
 * ## Why a link at all
 *
 * The Coach decides who gets access; the Athlete decides what their password
 * is. Those cannot be the same act. A coach who set the password would know it
 * and could sign in as the athlete — which is exactly what a Tracking Entry
 * marked `ATHLETE` claims did not happen. The link is the seam between the two
 * decisions.
 *
 * ## What it is not
 *
 * Not a Share (§17): a Share shows one document to whoever holds the link, this
 * creates an account. Not an `Invitation` either — that grants a role to an
 * address and is unique per `(organizationId, email)`, so one person invited
 * once as a coach and once as an athlete would collide on that key.
 *
 * ## No new Athlete, ever
 *
 * Every function here starts from an Athlete row the Coach already created.
 * Nothing in this file can produce one, and a link cannot be pointed at a
 * different athlete once it has been sent.
 */

/** How long a link stays open: long enough for a holiday, short enough to expire. */
export const ACTIVATION_DAYS = 14;

// Re-exported so the service reads as one place to look, while the value stays
// in `../schemas`, which a client form may import.
export { MIN_PORTAL_PASSWORD_LENGTH };

/**
 * A token nobody guesses: 32 random bytes, base64url so it survives a URL and a
 * copy out of a mail client without escaping.
 */
export function newActivationToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What the database stores instead of the token.
 *
 * SHA-256 rather than scrypt, deliberately. Password hashing is slow because
 * passwords are weak; this input is 256 bits from a CSPRNG, so there is no
 * guessing to slow down. What the hash buys is that a leaked database contains
 * no working links.
 */
export function activationTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type ActivationDb = Pick<PrismaClientInstance, 'athleteActivation' | 'athlete'>;

/** Why a link could not be issued. Each is a different sentence to a coach. */
export type IssueRefusal = 'NOT_FOUND' | 'ALREADY_ACTIVE' | 'ARCHIVED' | 'NO_EMAIL';

export type IssuedActivation =
  | {
      readonly ok: true;
      readonly token: string;
      readonly expiresAt: Date;
      readonly email: string;
      readonly firstName: string;
    }
  | { readonly ok: false; readonly reason: IssueRefusal };

/**
 * Issues a link for one existing Athlete.
 *
 * Issuing again is the ordinary way to deal with a message that never arrived,
 * so it is allowed — and it **supersedes** every link still standing for this
 * athlete. Two open links would be two ways in, and withdrawing one would leave
 * the other working.
 */
export async function issueActivation(
  db: ActivationDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  issuedByCoachId: string,
  athleteId: string,
): Promise<IssuedActivation> {
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId }),
    select: { id: true, firstName: true, email: true, archivedAt: true, userId: true },
  });

  if (!athlete) return { ok: false, reason: 'NOT_FOUND' };
  if (athlete.userId !== null) return { ok: false, reason: 'ALREADY_ACTIVE' };
  // A deactivated athlete keeps read-only access to an account they already
  // have (§21). They do not get a new one — reactivating comes first.
  if (athlete.archivedAt !== null) return { ok: false, reason: 'ARCHIVED' };
  if (athlete.email === null || athlete.email.trim() === '') {
    return { ok: false, reason: 'NO_EMAIL' };
  }

  const email = athlete.email.trim();

  await db.athleteActivation.updateMany({
    where: scoped(tenant, { athleteId: athlete.id, usedAt: null, revokedAt: null }),
    data: { revokedAt: new Date() },
  });

  const token = newActivationToken();
  const expiresAt = new Date(Date.now() + ACTIVATION_DAYS * 24 * 60 * 60 * 1000);

  await db.athleteActivation.create({
    data: withTenant(tenant, {
      tokenHash: activationTokenHash(token),
      // Frozen on purpose: the account is created with the address the link was
      // sent to, so an edit made afterwards cannot redirect it elsewhere.
      email,
      expiresAt,
      athleteId: athlete.id,
      issuedByCoachId,
    }),
    select: { id: true },
  });

  return { ok: true, token, expiresAt, email, firstName: athlete.firstName };
}

/**
 * The link still standing for an athlete, if there is one.
 *
 * Deliberately without the token: it was never stored, only its hash, so there
 * is nothing here to show a second time. What a coach needs afterwards is
 * whether an offer is open and until when — the link itself they either kept
 * from the moment they made it, or they issue a new one.
 */
export async function standingActivation(
  db: Pick<PrismaClientInstance, 'athleteActivation'>,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
): Promise<{ readonly email: string; readonly expiresAt: Date } | null> {
  return db.athleteActivation.findFirst({
    where: scoped(tenant, {
      athleteId,
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    }),
    orderBy: { createdAt: 'desc' },
    select: { email: true, expiresAt: true },
  });
}

/** Withdraws every link still standing for an athlete. */
export async function revokeActivations(
  db: Pick<PrismaClientInstance, 'athleteActivation'>,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
): Promise<number> {
  const { count } = await db.athleteActivation.updateMany({
    where: scoped(tenant, { athleteId, usedAt: null, revokedAt: null }),
    data: { revokedAt: new Date() },
  });

  return count;
}

/** Why a link will not open. */
export type RedeemRefusal =
  'UNKNOWN' | 'EXPIRED' | 'USED' | 'REVOKED' | 'ALREADY_ACTIVE' | 'EMAIL_TAKEN';

export interface OpenActivation {
  readonly id: string;
  readonly athleteId: string;
  readonly organizationId: string;
  readonly email: string;
  /** Shown on the page, so the athlete sees the link is meant for them. */
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * Resolves a token to the link it opens.
 *
 * **This is the one read here with no tenant scope, and that is not an
 * oversight.** Whoever holds the token has no session yet, so there is no scope
 * to derive from one. The token *is* the credential: it is looked up by its
 * hash, that hash is unique, and the row it finds carries the workspace. Every
 * write that follows is scoped by what is found here — never by anything the
 * client sent.
 */
export async function resolveActivation(
  db: Pick<PrismaClientInstance, 'athleteActivation'>,
  token: string,
): Promise<{ ok: true; activation: OpenActivation } | { ok: false; reason: RedeemRefusal }> {
  const row = await db.athleteActivation.findUnique({
    where: { tokenHash: activationTokenHash(token) },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      athleteId: true,
      organizationId: true,
      athlete: { select: { firstName: true, lastName: true, userId: true } },
    },
  });

  if (!row) return { ok: false, reason: 'UNKNOWN' };
  if (row.usedAt !== null) return { ok: false, reason: 'USED' };
  if (row.revokedAt !== null) return { ok: false, reason: 'REVOKED' };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'EXPIRED' };
  // Belt and braces: a link that somehow escaped being marked used still must
  // not activate an athlete who already has an account.
  if (row.athlete.userId !== null) return { ok: false, reason: 'ALREADY_ACTIVE' };

  return {
    ok: true,
    activation: {
      id: row.id,
      athleteId: row.athleteId,
      organizationId: row.organizationId,
      email: row.email,
      firstName: row.athlete.firstName,
      lastName: row.athlete.lastName,
    },
  };
}

/**
 * Spends the link: creates the account and links it to the existing Athlete.
 *
 * ## Why the user is written here rather than through Better Auth's sign-up
 *
 * Public sign-up means "a coach registered". It fires the hook that provisions
 * a coach profile and a personal workspace, and it opens a session. An athlete
 * needs none of the three. Writing the two rows directly — with Better Auth's
 * own password hash, so `signInEmail` verifies it unchanged — keeps portal
 * activation out of that path entirely, which is what the note in
 * `packages/auth/src/server.ts` asks for.
 *
 * ## Why no session is opened
 *
 * The athlete signs in afterwards with what they just chose. It costs one
 * screen and removes a race: between creating the account and linking it there
 * is a moment where a session would have no workspace.
 *
 * ## Why every write carries its own guard
 *
 * Two people opening the same link at once, or a resubmitted form, must produce
 * one account rather than two. `usedAt: null` and `userId: null` sit inside the
 * `where` clauses rather than in a check beforehand, so the database decides and
 * a losing transaction rolls back whole.
 */
export async function redeemActivation(
  db: PrismaClientInstance,
  token: string,
  password: string,
): Promise<{ ok: true; email: string } | { ok: false; reason: RedeemRefusal }> {
  const resolved = await resolveActivation(db, token);
  if (!resolved.ok) return resolved;

  const { activation } = resolved;
  const hash = await hashPassword(password);

  try {
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: `${activation.firstName} ${activation.lastName}`.trim(),
          email: activation.email,
          // They proved they read the mailbox by opening the link.
          emailVerified: true,
        },
        select: { id: true },
      });

      await tx.account.create({
        data: {
          userId: user.id,
          // What Better Auth writes for an email-and-password account.
          providerId: 'credential',
          accountId: user.id,
          password: hash,
        },
      });

      await tx.membership.create({
        data: { userId: user.id, organizationId: activation.organizationId, role: 'athlete' },
      });

      const linked = await tx.athlete.updateMany({
        where: {
          id: activation.athleteId,
          organizationId: activation.organizationId,
          userId: null,
        },
        data: { userId: user.id },
      });

      if (linked.count === 0) throw new ActivationRace('ALREADY_ACTIVE');

      const spent = await tx.athleteActivation.updateMany({
        where: { id: activation.id, usedAt: null, revokedAt: null },
        data: { usedAt: new Date() },
      });

      if (spent.count === 0) throw new ActivationRace('USED');
    });
  } catch (error) {
    if (error instanceof ActivationRace) return { ok: false, reason: error.reason };
    // `User.email` is unique platform-wide: one address, one account. A person
    // already registered here as a coach needs a different one as an athlete.
    if (isUniqueConstraintViolation(error)) return { ok: false, reason: 'EMAIL_TAKEN' };
    throw error;
  }

  return { ok: true, email: activation.email };
}

/** Rolls the transaction back and names why, without inventing an error type. */
class ActivationRace extends Error {
  constructor(readonly reason: RedeemRefusal) {
    super(reason);
    this.name = 'ActivationRace';
  }
}

/** Prisma's `P2002`, without importing from the generated client. */
function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
