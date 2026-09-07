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
 * ## An athlete signed in to the portal
 *
 * A workspace holds several athletes, so "this workspace's report" is a coach's
 * entitlement and not theirs (§21). A portal session is therefore narrowed to
 * the one athlete it is linked to, on both branches below — the same rule the
 * portal procedures follow, applied to the bytes as well as to the rows.
 *
 * An athlete **without** an account reads their pictures under `/geteilt`
 * instead, where the proof is a cookie scoped to their own link — see there.
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
  /**
   * The athlete this session *is*, where it is one.
   *
   * Read once, before the branches, because both of them need the same
   * narrowing and a check that only one branch remembered would be the hole.
   * `null` for a coach, who is entitled to the whole workspace.
   */
  const self =
    tenant.role === 'athlete'
      ? await db.athlete.findFirst({
          where: { userId: tenant.userId, organizationId: tenant.organizationId },
          select: { id: true },
        })
      : null;

  // Working files of an analysis in progress. A coach's own workspace, and
  // never an athlete's to read.
  if (analysisKeyBelongsToOrganization(key, tenant.organizationId)) {
    return tenant.role !== 'athlete';
  }

  const reportId = reportOfKey(key);
  if (reportId !== null) {
    const report = await db.report.findFirst({
      where: scoped(tenant, {
        id: reportId,
        ...(self === null
          ? {}
          : {
              // The picture follows the document: the same three scopes the
              // portal reads a report through (§16).
              OR: [
                { assessment: { case: { athleteId: self.id } } },
                { case: { athleteId: self.id } },
                { assessmentModule: { assessment: { case: { athleteId: self.id } } } },
              ],
            }),
      }),
      select: { id: true },
    });

    return report !== null;
  }

  const athleteId = athleteOfKey(key);
  if (athleteId !== null) {
    if (self !== null) return athleteId === self.id;

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
