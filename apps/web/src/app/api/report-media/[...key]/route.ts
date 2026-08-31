import { db } from '@apex/database';
import { scoped } from '@apex/database/tenant';
import {
  analysisKeyBelongsToOrganization,
  athleteOfKey,
  reportOfKey,
  STILL_CONTENT_TYPE,
} from '@apex/domain';

import { visibleToViewer, viewerOf } from '@/features/athletes/server/access';
import { getObject } from '@/integrations/object-store';
import { routeTenant } from '@/server/tenant';

/**
 * One file, for somebody signed in to the workspace entitled to it.
 *
 * ## Why each area is asked a different question
 *
 * The path says which area a file is in, and each area's entitlement is a
 * different fact:
 *
 * - `analysis-temp/<org>/…` — the workspace is in the path, so a string
 *   comparison settles it before anything is fetched. A traversal (`..`) fails
 *   the same test, because a key that escapes its prefix no longer starts with
 *   it.
 * - `reports/<reportId>/…` — the question is whether *this report* is this
 *   workspace's, which only the record can answer.
 * - `athletes/<athleteId>/…` — whether the caller may see that athlete, which
 *   §7 already decides. Asking it here rather than inventing a second rule is
 *   what keeps a released athlete's files released and a private one's private.
 *
 * ## Why every failure is a 404
 *
 * A missing file, another workspace's file and an unconfigured bucket all answer
 * alike. Distinguishing them would let anyone with a session learn which keys
 * exist elsewhere, which is the only thing this route could leak.
 *
 * The athlete's own copy of a report picture is served by a different route
 * under `/geteilt`, because their proof of access is a cookie scoped to that
 * path — see there.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params;
  const key = segments.join('/');

  const tenant = await routeTenant();
  if (tenant === null) return new Response(null, { status: 404 });

  if (!(await entitled(key, tenant))) return new Response(null, { status: 404 });

  const object = await getObject(key);
  if (object === null) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(object.body), {
    headers: {
      'Content-Type': object.contentType || STILL_CONTENT_TYPE,
      // Private: the bytes are one workspace's, and a shared cache in front of
      // this route must never hand them to the next caller.
      'Cache-Control': 'private, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function entitled(
  key: string,
  tenant: NonNullable<Awaited<ReturnType<typeof routeTenant>>>,
): Promise<boolean> {
  if (analysisKeyBelongsToOrganization(key, tenant.organizationId)) return true;

  const reportId = reportOfKey(key);
  if (reportId !== null) {
    const report = await db.report.findFirst({
      where: scoped(tenant, { id: reportId }),
      select: { id: true },
    });

    return report !== null;
  }

  const athleteId = athleteOfKey(key);
  if (athleteId !== null) {
    // Their real role: an owner administers the workspace and is not narrowed.
    const viewer = await viewerOf(db, tenant);
    const athlete = await db.athlete.findFirst({
      where: scoped(tenant, { id: athleteId, ...visibleToViewer(viewer) }),
      select: { id: true },
    });

    return athlete !== null;
  }

  return false;
}
