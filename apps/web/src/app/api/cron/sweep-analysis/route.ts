import { db } from '@apex/database';

import { env } from '@/env';
import { sweepAllAnalysisStills } from '@/features/reports/server/media';
import { sweepExpiredAnalysisLeases } from '@/services/assets/analysis-lease';

/**
 * Clears the working files of analyses nobody came back to.
 *
 * ## Why a scheduled route and not a bucket rule
 *
 * Supabase Storage has no lifetime rule of its own, so the retention is code.
 * `vercel.json` calls this once a day; the rule it applies — fourteen days —
 * lives with the paths it applies to, not here.
 *
 * ## Why it is not open
 *
 * Deleting is not a read: an endpoint that swept on request would let anyone who
 * found the URL clear a coach's working material. Vercel signs its own schedule
 * with `Authorization: Bearer <CRON_SECRET>`, and without that secret configured
 * this route refuses everything rather than defaulting to open.
 *
 * ## Why it walks every workspace
 *
 * There is no session here — a schedule has no user. The sweep is bounded by
 * age instead, and it touches only the temporary area, which is exactly the
 * material nobody is entitled to keep.
 */
export async function POST(request: Request): Promise<Response> {
  return run(request);
}

/** Vercel's scheduler issues a GET. The same check, the same work. */
export async function GET(request: Request): Promise<Response> {
  return run(request);
}

async function run(request: Request): Promise<Response> {
  const secret = env.CRON_SECRET;

  // No secret configured means no scheduled deletion. Refusing is the safe
  // default; a sweep that ran for anybody would be worse than one that never
  // runs, and the 14-day rule is a tidy-up, not a guarantee anyone relies on.
  if (typeof secret !== 'string' || secret === '') {
    return Response.json({ error: 'not_configured' }, { status: 404 });
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const removed = await sweepAllAnalysisStills();

  /**
   * Holds whose lease ran out (§18).
   *
   * Not required for correctness — an expired lease already protects nothing —
   * but a row that says `RUNNING` about an analysis nobody is running is a lie
   * the next reader has to decode. Swept here rather than on its own schedule:
   * it is the same caretaking, over the same abandoned screens.
   */
  const leases = await sweepExpiredAnalysisLeases(db);

  return Response.json({ removed, leases });
}
