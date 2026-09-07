import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '@/env';

/**
 * The server's permission to write **one** object (§18).
 *
 * ## Why a ticket exists at all
 *
 * A resumable upload cannot go through a server action — its whole point is
 * that the bytes arrive in chunks over minutes. So the browser talks to a proxy
 * route, and that route needs to know what the caller was allowed to do without
 * asking the browser to tell it.
 *
 * The ticket is that answer, decided once by a procedure that already knows who
 * is calling: which workspace, which athlete, which storage key, which type,
 * how many bytes. **Everything the upload needs is inside it**, so the client
 * supplies none of it.
 *
 * ## What this rules out
 *
 * A client cannot choose a bucket, an athlete, a workspace or a storage key.
 * It cannot enlarge the file it declared. It cannot reuse yesterday's ticket.
 * Those are not checks somebody has to remember to make — there is simply no
 * parameter for any of them on the way in.
 *
 * ## Why signed rather than stored
 *
 * A table would need a migration, a write on every upload and a sweep for the
 * ones nobody used. The ticket is short-lived and self-describing, so an HMAC
 * over its own contents is enough: tampering changes the signature, and expiry
 * is inside the signed payload.
 *
 * The key is derived from `BETTER_AUTH_SECRET` with a purpose string mixed in,
 * so a ticket can never be mistaken for — or forged from — anything else signed
 * in this application.
 */

/** How long a ticket is good for. Long enough for a 50 MB upload on hotel Wi-Fi. */
const TICKET_LIFETIME_MS = 2 * 60 * 60 * 1000;

/** Everything the proxy and the registration need to know. */
export interface UploadTicket {
  readonly organizationId: string;
  readonly athleteId: string;
  /** Where the bytes go. Built by the server, never sent by the client. */
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly fileName: string;
  readonly folderId: string | null;
  /** The coach who is uploading, or `null` where the athlete is (§18). */
  readonly uploadedByCoachId: string | null;
  /** Milliseconds since the epoch. Inside the signature. */
  readonly expiresAt: number;
}

/**
 * A key for this purpose and no other.
 *
 * Domain-separated: the same secret signs sessions elsewhere, and a value that
 * could be moved between the two would be a hole in both.
 */
function key(): Buffer {
  return createHmac('sha256', String(env.BETTER_AUTH_SECRET)).update('apex.upload-ticket').digest();
}

const sign = (payload: string): string =>
  createHmac('sha256', key()).update(payload).digest('base64url');

/** Mints a ticket. Only ever called from a procedure that has already decided. */
export function issueUploadTicket(ticket: Omit<UploadTicket, 'expiresAt'>): string {
  const payload = Buffer.from(
    JSON.stringify({ ...ticket, expiresAt: Date.now() + TICKET_LIFETIME_MS }),
  ).toString('base64url');

  return `${payload}.${sign(payload)}`;
}

/**
 * Reads a ticket back, or `null`.
 *
 * One answer for a forged signature, a mangled payload and an expired ticket:
 * they are all "this does not permit anything", and telling them apart would
 * only help somebody probing.
 */
export function readUploadTicket(value: string): UploadTicket | null {
  const [payload, signature] = value.split('.');
  if (payload === undefined || signature === undefined) return null;

  const expected = Buffer.from(sign(payload), 'utf8');
  const given = Buffer.from(signature, 'utf8');

  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let ticket: UploadTicket;
  try {
    ticket = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UploadTicket;
  } catch {
    return null;
  }

  if (typeof ticket.expiresAt !== 'number' || ticket.expiresAt <= Date.now()) return null;
  if (typeof ticket.storageKey !== 'string' || ticket.storageKey === '') return null;

  return ticket;
}

/**
 * Signs an upstream upload URL so the proxy can be handed it back.
 *
 * The resumable protocol answers a creation with a `Location` the client then
 * PATCHes. That location belongs to the store and must not be given to the
 * browser — so the proxy returns one of its own, carrying the upstream URL
 * signed. A client that edits it gets nothing.
 */
export function sealUploadLocation(upstreamUrl: string): string {
  const payload = Buffer.from(upstreamUrl, 'utf8').toString('base64url');

  return `${payload}.${sign(payload)}`;
}

/** Reads a sealed location back, or `null` where it was not this server's. */
export function openUploadLocation(value: string): string | null {
  const [payload, signature] = value.split('.');
  if (payload === undefined || signature === undefined) return null;

  const expected = Buffer.from(sign(payload), 'utf8');
  const given = Buffer.from(signature, 'utf8');

  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  const url = Buffer.from(payload, 'base64url').toString('utf8');

  // It must point at the configured store and nowhere else — otherwise a sealed
  // location would be a way to make this server fetch arbitrary addresses.
  return url.startsWith(`${String(env.SUPABASE_URL)}/storage/v1/upload/resumable`) ? url : null;
}
