import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped } from '@apex/database/tenant';
import { readReportSnapshot, type ReportSnapshot } from '@apex/domain';
import type { TenantContext } from '@apex/types';

/**
 * The analyses an athlete may read in their own portal (§21).
 *
 * ## What "shared with me" means, and why it is derived rather than stored
 *
 * A Share (§17) is addressed to whoever holds the link, not to a person — it
 * has a token and a password, no recipient column. So the question "which
 * analyses is this athlete allowed to read" is answered from two facts that are
 * already recorded: the report is **about them**, and the coach has granted an
 * active Share for it.
 *
 * That keeps one decision in one place. The coach still decides what is shared,
 * in exactly the control they already use; withdrawing a link withdraws it here
 * too, and an expiry expires here too. Nothing new to keep in step.
 *
 * ## Why the account replaces the password, and not the share
 *
 * On the link, the password *is* the proof of who is reading — there is no
 * account behind it. In the portal there is one, and it is a stronger proof
 * than a string passed on by hand. Asking for both would mean an athlete who is
 * signed in still has to find an old message to read their own analysis.
 *
 * The link keeps working unchanged for athletes without an account, which is
 * still the default access model (§21).
 *
 * ## Why a report id may come from the client here
 *
 * It never decides anything on its own. It is one more condition in a filter
 * that already carries the workspace, the athlete and the active share — so an
 * id belonging to somebody else matches no row rather than being reached
 * across, exactly as with the entry ids in `tracking-router.ts`.
 */

type ReportDb = Pick<PrismaClientInstance, 'report'>;

/** A share that is neither withdrawn nor expired, right now. */
const activeShare = (now: Date) => ({
  some: {
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  },
});

/**
 * Which reports belong to this athlete, whichever scope they were written at.
 *
 * A Report hangs off an Assessment, a Case or a Module (§16), so the athlete is
 * one, two or three relations away. Spelling out all three is what stops a
 * case-scoped analysis from silently never appearing.
 */
const aboutAthlete = (athleteId: string) => ({
  OR: [
    { assessment: { case: { athleteId } } },
    { case: { athleteId } },
    { assessmentModule: { assessment: { case: { athleteId } } } },
  ],
});

export interface SharedReportSummary {
  readonly id: string;
  readonly title: string;
  readonly publishedAt: Date | null;
  /** The question the examination asked, where the report hangs off one. */
  readonly question: string | null;
  readonly performedAt: Date | null;
}

/** Newest first: what an athlete looks for is the one that just arrived. */
export async function sharedReportsFor(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  now: Date = new Date(),
): Promise<SharedReportSummary[]> {
  const reports = await db.report.findMany({
    where: scoped(tenant, {
      status: 'PUBLISHED' as const,
      archivedAt: null,
      shares: activeShare(now),
      ...aboutAthlete(athleteId),
    }),
    select: {
      id: true,
      title: true,
      publishedAt: true,
      assessment: { select: { question: true, performedAt: true } },
    },
    orderBy: [{ publishedAt: 'desc' }],
  });

  return reports.map((report) => ({
    id: report.id,
    title: report.title,
    publishedAt: report.publishedAt,
    question: report.assessment?.question ?? null,
    performedAt: report.assessment?.performedAt ?? null,
  }));
}

/**
 * One analysis, as it was frozen at publication (§16).
 *
 * Returns `null` for anything that is not this athlete's, not published, or no
 * longer behind an active share — one answer for all of them, so this cannot be
 * used to learn which reports exist.
 */
export async function sharedReportFor(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  reportId: string,
  now: Date = new Date(),
): Promise<{ title: string; publishedAt: Date | null; snapshot: ReportSnapshot } | null> {
  const report = await db.report.findFirst({
    where: scoped(tenant, {
      id: reportId,
      status: 'PUBLISHED' as const,
      archivedAt: null,
      shares: activeShare(now),
      ...aboutAthlete(athleteId),
    }),
    select: { title: true, publishedAt: true, content: true },
  });

  if (!report) return null;

  const snapshot = readReportSnapshot(report.content);
  if (snapshot === null) return null;

  return { title: report.title, publishedAt: report.publishedAt, snapshot };
}
