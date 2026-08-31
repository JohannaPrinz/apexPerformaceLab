import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { AppError } from '@apex/types';

import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';

import {
  athleteIdSchema,
  athleteTrendsSchema,
  createAthleteSchema,
  listAthletesSchema,
  setAthleteArchivedSchema,
  updateAthleteSchema,
} from '../schemas';

import {
  confirmAthleteShare,
  revokeAthleteShare,
  shareableCoaches,
  shareAthlete,
  sharesForAthletes,
  sharesOfAthlete,
  viewerOf,
  visibleToViewer,
} from './access';
import { movementProfilesFor } from './movement-profiles';
import {
  countAthletes,
  countAthletesMatching,
  createAthlete,
  findAthleteDuplicates,
  listRecentAthletes,
  getAthlete,
  listAthletes,
  setAthleteArchived,
  updateAthlete,
} from './service';
import {
  deleteTrackingEntry,
  recordTrackingEntry,
  setTrendCard,
  trackingEntriesFor,
  trendCardsFor,
} from './tracking';
import { athleteTrend, athleteTrendOptions } from './trends';

/** A missing athlete and another tenant's athlete are the same answer (§4). */
const notFound = () =>
  new TRPCError({
    code: 'NOT_FOUND',
    message: 'Athlet nicht gefunden.',
    cause: AppError.notFound('Athlete'),
  });

/**
 * Athlete router.
 *
 * Every procedure is permission-gated and tenant-scoped. `create` uses
 * `withCoachPermission` because the athlete records its author; the others need
 * no coach identity, so they do not pay for the lookup.
 */
export const athletesRouter = createTRPCRouter({
  list: withPermission('athlete:read')
    .input(listAthletesSchema)
    .query(async ({ ctx, input }) =>
      listAthletes(ctx.db, ctx.tenant, input, visibleToViewer(await viewerOf(ctx.db, ctx.tenant))),
    ),

  /**
   * How many athletes the same filters match.
   *
   * Separate from `list` rather than folded into its return: `Page<T>` is the
   * shape every cursor-paginated list uses, and one screen wanting a total is
   * not a reason to change it for all of them. The `where` is shared, so the
   * number and the list can never describe different sets.
   */
  count: withPermission('athlete:read')
    .input(listAthletesSchema.pick({ search: true, status: true }))
    .query(async ({ ctx, input }) =>
      countAthletesMatching(
        ctx.db,
        ctx.tenant,
        input,
        visibleToViewer(await viewerOf(ctx.db, ctx.tenant)),
      ),
    ),

  /**
   * The workspace overview's two figures and its shortcut list.
   *
   * One procedure rather than three: the overview always wants all of it, and a
   * page that fires three round trips for one screen is three chances to be
   * half-rendered. Same permission and same tenant scope as the roster.
   */
  overview: withPermission('athlete:read')
    .input(z.object({ limit: z.number().int().min(1).max(12).default(6) }).optional())
    .query(async ({ ctx, input }) => {
      const [counts, recent] = await Promise.all([
        countAthletes(ctx.db, ctx.tenant),
        listRecentAthletes(ctx.db, ctx.tenant, input?.limit ?? 6),
      ]);

      return { counts, recent };
    }),

  byId: withPermission('athlete:read')
    .input(athleteIdSchema)
    .query(async ({ ctx, input }) => {
      const athlete = await getAthlete(
        ctx.db,
        ctx.tenant,
        input.athleteId,
        visibleToViewer(await viewerOf(ctx.db, ctx.tenant)),
      );
      if (!athlete) throw notFound();

      return athlete;
    }),

  /**
   * What this athlete's record looks like over time.
   *
   * Options and charts in one read: the list of what could be drawn comes from
   * what was actually recorded, so asking separately would let a slot offer a
   * quantity the charts cannot fill.
   *
   * Nothing here interprets. No trend line, no average, no verdict — the
   * catalogue holds no reference range and the model records no direction for
   * any quantity.
   */
  /** The colleagues this athlete could be released to — coaches of this workspace. */
  shareableCoaches: withPermission('athlete:read').query(({ ctx }) =>
    shareableCoaches(ctx.db, ctx.tenant),
  ),

  /** Who this athlete has been released to, and whether it has taken effect. */
  shares: withPermission('athlete:read')
    .input(z.object({ athleteId: z.string().min(1).max(64) }))
    .query(({ ctx, input }) => sharesOfAthlete(ctx.db, ctx.tenant, input.athleteId)),

  /**
   * The same, for a whole list.
   *
   * One read rather than one per tile: a roster of thirty athletes would
   * otherwise open thirty connections to answer one question.
   */
  sharesForMany: withPermission('athlete:read')
    .input(z.object({ athleteIds: z.array(z.string().min(1).max(64)).max(200) }))
    .query(({ ctx, input }) => sharesForAthletes(ctx.db, ctx.tenant, input.athleteIds)),

  /**
   * Offers a colleague access to this athlete.
   *
   * Both ends are checked against this workspace inside the service — the
   * athlete must be one the caller may see, and the colleague must be a coach
   * here. Nothing about either is taken on trust from the request.
   */
  share: withCoachPermission('athlete:write')
    .input(z.object({ athleteId: z.string().min(1).max(64), coachId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const result = await shareAthlete(ctx.db, ctx.tenant, input.athleteId, input.coachId);

      if (!result.ok) {
        throw new TRPCError({
          code: result.refusal === 'ATHLETE_NOT_FOUND' ? 'NOT_FOUND' : 'BAD_REQUEST',
          message:
            result.refusal === 'ATHLETE_NOT_FOUND'
              ? 'Athlet nicht gefunden.'
              : result.refusal === 'ALREADY_OWNER'
                ? 'Dieser Coach betreut den Athleten bereits.'
                : 'Dieser Coach gehört nicht zu diesem Arbeitsbereich.',
        });
      }

      return { ok: true };
    }),

  /** Records that the athlete agreed. Only then does the release take effect. */
  confirmShare: withCoachPermission('athlete:write')
    .input(z.object({ athleteId: z.string().min(1).max(64), coachId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const done = await confirmAthleteShare(ctx.db, ctx.tenant, input.athleteId, input.coachId);
      if (!done) throw new TRPCError({ code: 'NOT_FOUND', message: 'Freigabe nicht gefunden.' });

      return { ok: true };
    }),

  /** Withdraws a release. */
  revokeShare: withCoachPermission('athlete:write')
    .input(z.object({ athleteId: z.string().min(1).max(64), coachId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const done = await revokeAthleteShare(ctx.db, ctx.tenant, input.athleteId, input.coachId);
      if (!done) throw new TRPCError({ code: 'NOT_FOUND', message: 'Freigabe nicht gefunden.' });

      return { ok: true };
    }),

  /** Which movements this athlete has had analysed. A headline and a way in. */
  movementProfiles: withPermission('athlete:read')
    .input(z.object({ athleteId: z.string().min(1).max(64) }))
    .query(({ ctx, input }) => movementProfilesFor(ctx.db, ctx.tenant, input)),

  /**
   * The analysis one test carries, or `null`.
   *
   * The test screen's own reading. Same assembly as the profile's list, so the
   * two cannot disagree about the same recording — and tenant-scoped inside it,
   * so a module id from another workspace answers `null` rather than 404ing
   * differently from one that never existed.
   */
  movementProfile: withPermission('athlete:read')
    .input(z.object({ moduleId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const found = await movementProfilesFor(ctx.db, ctx.tenant, input);

      return found[0] ?? null;
    }),

  trends: withPermission('athlete:read')
    .input(athleteTrendsSchema)
    .query(async ({ ctx, input }) => {
      const athlete = await getAthlete(
        ctx.db,
        ctx.tenant,
        input.athleteId,
        visibleToViewer(await viewerOf(ctx.db, ctx.tenant)),
      );
      if (!athlete) throw notFound();

      // The sex decides whether a cycle card is offered at all, so it travels
      // with the read rather than being looked up a second time.
      const subject = { id: athlete.id, sex: athlete.sex };

      const stored = await trendCardsFor(ctx.db, ctx.tenant, athlete.id);

      /**
       * What to draw.
       *
       * The address bar wins where it says something — that is how one
       * particular view gets linked. Otherwise the profile opens with what the
       * coach chose. Resolved here rather than on the page so the charts and the
       * selection come from one read instead of two round trips.
       */
      const slots =
        input.slots.length > 0
          ? input.slots
          : stored.map((key) => ({ key, exerciseIds: [] as string[] }));

      const options = await athleteTrendOptions(ctx.db, ctx.tenant, subject);
      const charts = await Promise.all(
        slots.map((slot) => athleteTrend(ctx.db, ctx.tenant, subject, slot)),
      );

      return { options, charts, cards: stored, slots };
    }),

  /**
   * Shows or hides one card on this athlete's profile.
   *
   * A decision about *this* athlete, so it lives on their row. The platform
   * chooses nothing: an athlete without a selection has no cards.
   */
  setTrendCard: withPermission('athlete:write')
    .input(
      z.object({
        athleteId: z.string().min(1).max(64),
        key: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[a-z0-9_]+$/),
        shown: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ok = await setTrendCard(ctx.db, ctx.tenant, input.athleteId, input.key, input.shown);
      if (!ok) throw notFound();

      return { ok: true };
    }),

  /**
   * Writes one reading outside an examination.
   *
   * `withCoachPermission` because the entry records who put it there — §13 keeps
   * the person separate from the instrument, and a value with no author would
   * lose the distinction between a coach's note and an athlete's self-report.
   */
  recordTracking: withCoachPermission('athlete:write')
    .input(
      z.object({
        athleteId: z.string().min(1).max(64),
        measurementTypeKey: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[a-z0-9_]+$/),
        value: z.number().finite(),
        capturedAt: z.date(),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await recordTrackingEntry(
        ctx.db,
        ctx.tenant,
        { by: 'COACH', coachId: ctx.coach.id },
        input,
      );

      if (!result.ok) throw notFound();

      return result;
    }),

  /** Removes one reading. Deleted, never superseded — see §13. */
  deleteTracking: withPermission('athlete:write')
    .input(z.object({ entryId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const ok = await deleteTrackingEntry(ctx.db, ctx.tenant, input.entryId);
      if (!ok) throw notFound();

      return { ok: true };
    }),

  /** One athlete's readings of one quantity, for the card's own list. */
  trackingEntries: withPermission('athlete:read')
    .input(
      z.object({
        athleteId: z.string().min(1).max(64),
        key: z.string().trim().min(1).max(40),
      }),
    )
    .query(({ ctx, input }) => trackingEntriesFor(ctx.db, ctx.tenant, input.athleteId, input.key)),

  /**
   * Creates an athlete, warning about likely duplicates first (§7).
   *
   * The check lives **inside** the mutation rather than in a procedure the
   * client is expected to call beforehand: a caller that forgets the second
   * call would silently create the duplicate, and the safe path should not
   * depend on remembering anything.
   *
   * It returns a result rather than throwing. A duplicate is not an error — the
   * coach may well be entering twins, or the same name twice on purpose — so
   * the answer is "here is what I found, say the word", and `confirmDuplicate`
   * is that word.
   */
  create: withCoachPermission('athlete:write')
    .input(createAthleteSchema)
    .mutation(async ({ ctx, input }) => {
      if (!input.confirmDuplicate) {
        const candidates = await findAthleteDuplicates(ctx.db, ctx.tenant, input);

        if (candidates.length > 0) return { status: 'duplicates' as const, candidates };
      }

      return {
        status: 'created' as const,
        athlete: await createAthlete(ctx.db, ctx.tenant, ctx.coach.id, input),
      };
    }),

  update: withPermission('athlete:write')
    .input(updateAthleteSchema)
    .mutation(async ({ ctx, input }) => {
      const athlete = await updateAthlete(ctx.db, ctx.tenant, input);
      if (!athlete) throw notFound();

      return athlete;
    }),

  /**
   * Archive and restore, not delete. An Athlete is never deleted (§22) — the
   * permission is `athlete:write` for the same reason: this is a reversible
   * state change, not destruction.
   */
  setArchived: withPermission('athlete:write')
    .input(setAthleteArchivedSchema)
    .mutation(async ({ ctx, input }) => {
      const athlete = await setAthleteArchived(ctx.db, ctx.tenant, input.athleteId, input.archived);
      if (!athlete) throw notFound();

      return athlete;
    }),
});
