import { env } from '@/env';
import { RESUMABLE_ENDPOINT, UPLOAD_TICKET_HEADER } from '@/lib/uploads';
import { readUploadTicket, sealUploadLocation } from '@/server/upload-ticket';

/**
 * Starting a resumable upload, without giving the browser any credentials
 * (§18).
 *
 * ## Why a proxy and not a direct upload
 *
 * The store's resumable endpoint wants an authorisation header. The only
 * credential this application has for it is the service-role key, and that must
 * never reach a browser. The alternative — handing the browser its own token
 * and writing storage policies — would move the decision about who may write
 * where out of the code that already makes it correctly, and into a second
 * place that would have to agree with the first for ever.
 *
 * So the bytes pass through here. The credential stays on the server, and every
 * request is checked against a ticket the server itself issued.
 *
 * ## What the client cannot influence
 *
 * The bucket, the workspace, the athlete, the storage key and the declared
 * length all come from the **ticket**, not from the request. The client's own
 * `Upload-Metadata` is discarded rather than merged: merging is how a field
 * nobody thought about becomes the one that is trusted.
 *
 * ## The protocol
 *
 * `tus-js-client` speaks it; nothing here implements it. This creates the
 * upload upstream and hands back a `Location` of its own, sealed so the real
 * one never leaves the server — see `sealUploadLocation`.
 */

const TUS_VERSION = '1.0.0';

/** Base64 for one metadata value, as the protocol requires. */
const encode = (value: string): string => Buffer.from(value, 'utf8').toString('base64');

export async function POST(request: Request): Promise<Response> {
  const ticket = readUploadTicket(request.headers.get(UPLOAD_TICKET_HEADER) ?? '');
  if (ticket === null) return new Response(null, { status: 403 });

  if (
    typeof env.SUPABASE_URL !== 'string' ||
    typeof env.SUPABASE_SERVICE_ROLE_KEY !== 'string' ||
    env.SUPABASE_URL === ''
  ) {
    return new Response(null, { status: 503 });
  }

  /**
   * The length the client declares must match the length the ticket allows.
   *
   * Not "at most": a mismatch means the file being sent is not the file that
   * was authorised, and there is nothing sensible to do with that but refuse.
   */
  const declared = Number(request.headers.get('upload-length') ?? '0');
  if (!Number.isInteger(declared) || declared !== ticket.sizeBytes) {
    return new Response(null, { status: 400 });
  }

  const upstream = await fetch(`${env.SUPABASE_URL}/storage/v1/upload/resumable`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'tus-resumable': TUS_VERSION,
      'upload-length': String(ticket.sizeBytes),
      // Built here, from the ticket. Whatever the client sent is ignored.
      'upload-metadata': [
        `bucketName ${encode(env.SUPABASE_STORAGE_BUCKET)}`,
        `objectName ${encode(ticket.storageKey)}`,
        `contentType ${encode(ticket.mimeType)}`,
        `cacheControl ${encode('3600')}`,
      ].join(','),
      // A retried upload writes the same object again rather than a second one.
      'x-upsert': 'true',
    },
  });

  const location = upstream.headers.get('location');

  if (!upstream.ok || location === null) {
    return new Response(null, { status: upstream.status === 200 ? 502 : upstream.status });
  }

  return new Response(null, {
    status: 201,
    headers: {
      'tus-resumable': TUS_VERSION,
      location: `${RESUMABLE_ENDPOINT}/${sealUploadLocation(location)}`,
      'access-control-expose-headers': 'Location, Tus-Resumable',
    },
  });
}

/** What the protocol asks for before it starts. */
export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'tus-resumable': TUS_VERSION,
      'tus-version': TUS_VERSION,
      'tus-extension': 'creation',
      'tus-max-size': String(50 * 1024 * 1024),
    },
  });
}
