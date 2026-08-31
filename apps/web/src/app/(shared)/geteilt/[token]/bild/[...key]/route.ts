import { db } from '@apex/database';
import { snapshotMediaKeys, STILL_CONTENT_TYPE } from '@apex/domain';

import { hasSharePass } from '@/features/reports/server/share-access';
import { resolveShare } from '@/features/reports/server/sharing';
import { getObject } from '@/integrations/object-store';

/**
 * One still, for the athlete holding the link.
 *
 * ## Why it lives under `/geteilt` rather than under `/api`
 *
 * The proof that somebody knew the password is a cookie scoped to this path.
 * Serving these bytes from `/api` would mean widening that cookie to the whole
 * site — a worse trade than one more route file.
 *
 * ## Why the key is checked against the document
 *
 * Not "does this key belong to some workspace", but "is this one of the
 * pictures **this** published analysis owns". The snapshot lists them, and a key
 * that is not in that list is refused however valid it looks — a link to one
 * athlete's analysis can never be turned into a reader of another's.
 *
 * Every failure — unknown token, expired link, no password yet, a key the
 * document does not name — is the same 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; key: string[] }> },
) {
  const { token, key: segments } = await params;
  const key = segments.join('/');

  const share = await resolveShare(db, token);
  if (share === null || !share.active || share.snapshot === null) {
    return new Response(null, { status: 404 });
  }

  if (share.passwordHash === null || !(await hasSharePass(share.id, share.passwordHash))) {
    return new Response(null, { status: 404 });
  }

  if (!snapshotMediaKeys(share.snapshot).includes(key)) {
    return new Response(null, { status: 404 });
  }

  const object = await getObject(key);
  if (object === null) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(object.body), {
    headers: {
      'Content-Type': object.contentType || STILL_CONTENT_TYPE,
      'Cache-Control': 'private, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
