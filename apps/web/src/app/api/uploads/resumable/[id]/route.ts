import { env } from '@/env';
import { openUploadLocation } from '@/server/upload-ticket';

/**
 * Carrying the chunks of a resumable upload (§18).
 *
 * The second half of the proxy: the browser was handed a sealed location by
 * `../route.ts`, and every `PATCH` and `HEAD` it makes against that location
 * comes here to be unsealed and forwarded with the credential the browser does
 * not have.
 *
 * **The address is never taken from the request.** `openUploadLocation` both
 * checks the signature and insists the result points at the configured store,
 * so a tampered id cannot make this server fetch somewhere else.
 */

const TUS_VERSION = '1.0.0';

/** The headers the protocol needs back, and nothing else the store may add. */
function forwarded(response: Response, status?: number): Response {
  const headers = new Headers({ 'tus-resumable': TUS_VERSION });

  for (const name of ['upload-offset', 'upload-length', 'upload-expires']) {
    const value = response.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  return new Response(null, { status: status ?? response.status, headers });
}

function upstreamFor(id: string): string | null {
  if (typeof env.SUPABASE_SERVICE_ROLE_KEY !== 'string') return null;

  return openUploadLocation(decodeURIComponent(id));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const upstream = upstreamFor(id);
  if (upstream === null) return new Response(null, { status: 403 });

  const response = await fetch(upstream, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${String(env.SUPABASE_SERVICE_ROLE_KEY)}`,
      'tus-resumable': TUS_VERSION,
      'upload-offset': request.headers.get('upload-offset') ?? '0',
      'content-type': 'application/offset+octet-stream',
    },
    body: await request.arrayBuffer(),
  });

  return forwarded(response);
}

/** Where the store thinks the upload got to — what makes resuming possible. */
export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const upstream = upstreamFor(id);
  if (upstream === null) return new Response(null, { status: 403 });

  const response = await fetch(upstream, {
    method: 'HEAD',
    headers: {
      authorization: `Bearer ${String(env.SUPABASE_SERVICE_ROLE_KEY)}`,
      'tus-resumable': TUS_VERSION,
    },
  });

  return forwarded(response);
}

/** Abandoning an upload. The store drops what it has; nothing was ever filed. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const upstream = upstreamFor(id);
  if (upstream === null) return new Response(null, { status: 403 });

  const response = await fetch(upstream, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${String(env.SUPABASE_SERVICE_ROLE_KEY)}`,
      'tus-resumable': TUS_VERSION,
    },
  });

  return forwarded(response, response.status);
}
