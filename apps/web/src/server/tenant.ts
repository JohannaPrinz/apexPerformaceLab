import 'server-only';

import { headers } from 'next/headers';

import { auth } from '@apex/auth/server';
import { db } from '@apex/database';
import type { OrganizationRole } from '@apex/types';

/**
 * The workspace a route handler is acting in, or `null`.
 *
 * ## Why this exists beside the tRPC middleware
 *
 * `organizationProcedure` derives the same thing and is the only way feature
 * code should reach the database — but a route that returns *bytes* is not a
 * procedure, and pushing an image through tRPC would base64 it into JSON.
 *
 * So the rule is duplicated here, deliberately and in full: the workspace comes
 * from the session's active organization, **never** from anything the caller
 * sent, and membership is checked against the record rather than trusted from
 * the session. Those two lines are what stop a forged id, and a route that
 * skipped either would be the hole the middleware exists to close.
 */
export async function routeTenant(): Promise<{
  readonly organizationId: string;
  readonly userId: string;
  /** Their role here — an owner administers the workspace and sees all of it. */
  readonly role: OrganizationRole;
} | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const organizationId = session?.session.activeOrganizationId;

  if (!session?.user || !organizationId) return null;

  const membership = await db.membership.findUnique({
    where: { userId_organizationId: { userId: session.user.id, organizationId } },
    select: { role: true },
  });

  if (!membership) return null;

  return { organizationId, userId: session.user.id, role: membership.role };
}
