import { db } from '@apex/database';
import { scoped } from '@apex/database/tenant';

import { getObject } from '@/integrations/object-store';
import { routeTenant } from '@/server/tenant';

/**
 * One stored video, for the analysis screen that was allowed to ask for it
 * (§18).
 *
 * ## Why this route exists beside `/api/report-media`
 *
 * That one is addressed by **storage key**, which is right for a picture inside
 * a frozen document: the key is in the snapshot and the route decides whether
 * the caller may have it. Here the caller is a screen that knows an *asset*,
 * and §18 is explicit that a client must not hand a storage path to an analysis
 * at all. So this route is addressed by asset id and resolves the key itself.
 *
 * ## What it checks
 *
 * The workspace, from the session and never from the request. That the row is
 * a `VIDEO` and not archived — a pose model pointed at a PDF is a screen
 * somebody eventually clicked. And, for a portal session, that the asset is
 * that athlete's own: a workspace holds other athletes, so the tenant scope
 * that suffices for a coach does not suffice there (§21).
 *
 * ## Why every failure is a 404
 *
 * A missing asset, another workspace's asset, a photo and an unconfigured store
 * answer alike. Distinguishing them would let anyone with a session learn which
 * ids exist elsewhere, which is the only thing this route could leak.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  const { assetId } = await params;

  const tenant = await routeTenant();
  if (tenant === null) return new Response(null, { status: 404 });

  /**
   * The athlete this session *is*, where it is one.
   *
   * The same narrowing `/api/report-media` makes: a portal account reaches its
   * own record and no other.
   */
  const self =
    tenant.role === 'athlete'
      ? await db.athlete.findFirst({
          where: { userId: tenant.userId, organizationId: tenant.organizationId },
          select: { id: true },
        })
      : null;

  const asset = await db.asset.findFirst({
    where: scoped(tenant, {
      id: assetId,
      kind: 'VIDEO' as const,
      archivedAt: null,
      ...(self === null ? {} : { athleteId: self.id }),
    }),
    select: { storageKey: true, mimeType: true, fileName: true },
  });

  if (!asset) return new Response(null, { status: 404 });

  const object = await getObject(asset.storageKey);
  if (object === null) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(object.body), {
    headers: {
      'Content-Type': object.contentType || asset.mimeType,
      // Private: the bytes are one workspace's, and a shared cache in front of
      // this route must never hand them to the next caller.
      'Cache-Control': 'private, max-age=600',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
