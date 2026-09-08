import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { AppError } from '@apex/types';

import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';
import { issueUploadTicket, readUploadTicket } from '@/server/upload-ticket';
import {
  endAnalysisLease,
  heartbeatAnalysisLease,
  startAnalysisLease,
} from '@/services/assets/analysis-lease';
import { deleteAsset } from '@/services/assets/deletion';
import {
  analysisSourceFor,
  assetForDownload,
  createFolder,
  deleteFolder,
  listAthleteAssets,
  listFolders,
  prepareResumableUpload,
  registerUploadedAsset,
  renameFolder,
} from '@/services/assets/files';
import {
  addBiofeedbackQuantity,
  biofeedbackWeek,
  clearBiofeedbackValue,
  setBiofeedbackNote,
  setBiofeedbackRows,
  setBiofeedbackValue,
} from '@/services/tracking/biofeedback';
import {
  clearNutritionValue,
  nutritionWeek,
  setNutritionValue,
} from '@/services/tracking/nutrition';

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
  setTrendCardOrder,
  trackingEntriesFor,
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
/** A folder or file id from a request. Never a path, never a storage key. */
const assetIdSchema = z.string().min(1).max(64);
const folderNameSchema = z.string().trim().min(1).max(80);

/** Why a shelf could not be made or renamed, in the coach's language. */
function folderRefusal(refusal: 'EMPTY_NAME' | 'NAME_TAKEN' | 'NOT_FOUND'): TRPCError {
  if (refusal === 'NOT_FOUND') return notFound();

  return new TRPCError({
    code: refusal === 'NAME_TAKEN' ? 'CONFLICT' : 'BAD_REQUEST',
    message:
      refusal === 'NAME_TAKEN'
        ? 'Ein Ordner mit diesem Namen gibt es schon.'
        : 'Bitte einen Namen eingeben.',
  });
}

/**
 * Why a file stayed.
 *
 * Each reason is a different next step, so each gets its own sentence rather
 * than one "geht nicht" that sends somebody hunting.
 */
function assetRefusal(
  status:
    | 'DELETE_BLOCKED_ACTIVE_ANALYSIS'
    | 'DELETE_BLOCKED_MISSING_INSIGHT_EVIDENCE'
    | 'STORAGE_FAILED'
    | 'NOT_FOUND'
    | 'DELETE_ALLOWED',
): TRPCError {
  if (status === 'DELETE_BLOCKED_ACTIVE_ANALYSIS') {
    return new TRPCError({
      code: 'CONFLICT',
      message: 'Diese Datei wird gerade für eine Videoanalyse gebraucht.',
    });
  }

  if (status === 'DELETE_BLOCKED_MISSING_INSIGHT_EVIDENCE') {
    return new TRPCError({
      code: 'CONFLICT',
      message:
        'Diese Datei belegt einen Befund, und der Beleg besteht nirgends dauerhaft weiter. Erst veröffentlichen, dann löschen.',
    });
  }

  if (status === 'STORAGE_FAILED') {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Die Datei konnte im Speicher nicht entfernt werden. Bitte später erneut.',
    });
  }

  return notFound();
}

/** The shape both upload doors take, minus whose record it is. */
const UPLOAD_SHAPE = {
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  folderId: assetIdSchema.nullable().optional(),
} as const;

/** Why a file may not be put down, in the coach's language. */
function uploadRefusal(
  refusal: 'TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'EMPTY' | 'STORAGE_FAILED' | 'NOT_UPLOADED',
): TRPCError {
  const messages = {
    TOO_LARGE: 'Die Datei ist zu groß.',
    UNSUPPORTED_TYPE: 'Dieser Dateityp lässt sich hier nicht ablegen.',
    EMPTY: 'Die Datei ist leer.',
    STORAGE_FAILED: 'Der Speicher hat die Datei nicht angenommen.',
    NOT_UPLOADED: 'Die Datei ist nicht vollständig im Speicher angekommen.',
  } as const;

  return new TRPCError({
    code: refusal === 'NOT_UPLOADED' ? 'CONFLICT' : 'BAD_REQUEST',
    message: messages[refusal],
  });
}

/** Why a stored file cannot be analysed, in the coach's language. */
function analysisRefusal(refusal: 'NOT_FOUND' | 'NOT_A_VIDEO' | 'MISSING_IN_STORAGE'): TRPCError {
  if (refusal === 'NOT_A_VIDEO') {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Nur Videos lassen sich analysieren.',
    });
  }

  if (refusal === 'MISSING_IN_STORAGE') {
    return new TRPCError({
      code: 'CONFLICT',
      message: 'Zu dieser Datei liegen keine Daten mehr im Speicher.',
    });
  }

  return notFound();
}

/**
 * Who is looking, resolved once per request.
 *
 * Four procedures on this router build their visibility filter from the same
 * three facts — workspace, role, and which coach this account is — and each of
 * them used to read the coach row again. On an athlete profile that was three
 * identical reads of one row before any athlete data was touched.
 *
 * The memo lives on the request context, so it cannot outlive the request and
 * cannot be seen by another one. The key names the workspace **and** the user:
 * a viewer resolved for one tenant can never be handed to another.
 *
 * **It answers "who", never "may they"** — the filter it feeds is applied on
 * top of `scoped()`, and every procedure keeps the permission rung it had.
 */
function currentViewer(ctx: {
  db: Parameters<typeof viewerOf>[0];
  tenant: Parameters<typeof viewerOf>[1];
  perRequest: <T>(key: string, read: () => Promise<T>) => Promise<T>;
}) {
  return ctx.perRequest(`viewer:${ctx.tenant.organizationId}:${ctx.tenant.userId}`, () =>
    viewerOf(ctx.db, ctx.tenant),
  );
}

/**
 * The athlete this request is about, read once.
 *
 * The profile screen asks two procedures for the same record: `byId` for the
 * master data, `trends` because a chart needs the sex and the chosen cards. Both
 * read it through the same function with the same filter, so the second read
 * was the same row a second time — measured at 190 ms on a profile render.
 *
 * The memo lives on the request context and dies with it. The key names the
 * workspace, the account **and** the athlete, so nothing of another request,
 * another workspace or another viewer can come back through it — and the
 * visibility filter is still built from the viewer on every first read, which
 * is what decides whether this record may be seen at all (§7).
 */
function athleteFor(
  ctx: {
    db: Parameters<typeof getAthlete>[0] & Parameters<typeof viewerOf>[0];
    tenant: Parameters<typeof viewerOf>[1];
    perRequest: <T>(key: string, read: () => Promise<T>) => Promise<T>;
  },
  athleteId: string,
) {
  return ctx.perRequest(
    `athlete:${ctx.tenant.organizationId}:${ctx.tenant.userId}:${athleteId}`,
    async () =>
      getAthlete(ctx.db, ctx.tenant, athleteId, visibleToViewer(await currentViewer(ctx))),
  );
}

export const athletesRouter = createTRPCRouter({
  list: withPermission('athlete:read')
    .input(listAthletesSchema)
    .query(async ({ ctx, input }) =>
      listAthletes(ctx.db, ctx.tenant, input, visibleToViewer(await currentViewer(ctx))),
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
      countAthletesMatching(ctx.db, ctx.tenant, input, visibleToViewer(await currentViewer(ctx))),
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
      const athlete = await athleteFor(ctx, input.athleteId);
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
  shareableCoaches: withPermission('athlete:read').query(async ({ ctx }) =>
    shareableCoaches(ctx.db, ctx.tenant, await currentViewer(ctx)),
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
      const athlete = await athleteFor(ctx, input.athleteId);
      if (!athlete) throw notFound();

      // The sex decides whether a cycle card is offered at all, so it travels
      // with the read rather than being looked up a second time.
      const subject = { id: athlete.id, sex: athlete.sex };

      // The selection came along on the athlete row — it is a column on it, and
      // reading it again was a second round trip for something already in hand.
      const stored = athlete.trendCards;

      /**
       * What to draw.
       *
       * The address bar wins where it says something — that is how one
       * particular view gets linked. Otherwise the profile opens with what the
       * coach chose.
       */
      const slots =
        input.slots.length > 0
          ? input.slots
          : stored.map((key) => ({ key, exerciseIds: [] as string[] }));

      /**
       * The list of what could be drawn and the drawings themselves are
       * independent: the slots are known, so the charts do not wait on the
       * options. They used to, which put the whole depth of one read in front of
       * the other for no reason.
       */
      const [options, charts] = await Promise.all([
        athleteTrendOptions(ctx.db, ctx.tenant, subject),
        Promise.all(slots.map((slot) => athleteTrend(ctx.db, ctx.tenant, subject, slot))),
      ]);

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

  /**
   * One athlete's nutrition week.
   *
   * Its own procedure rather than a shape inside `trends`, because it answers a
   * different question: the trend charts draw a quantity over time, this is a
   * table of one week that is written into. They share the measurement types
   * and nothing else.
   */
  nutritionWeek: withPermission('athlete:read')
    .input(z.object({ athleteId: z.string().min(1).max(64), weekStart: z.date() }))
    .query(async ({ ctx, input }) => {
      const week = await nutritionWeek(ctx.db, ctx.tenant, input.athleteId, input.weekStart);
      if (week === null) throw notFound();

      return week;
    }),

  /**
   * Sets one cell of that table.
   *
   * `withCoachPermission` for the same reason `recordTracking` uses it: the
   * entry records who put it there, and a value with no author would lose the
   * distinction between a coach's note and an athlete's self-report (§13).
   *
   * **The athlete's own writing is not here.** The model carries
   * `recordedBy: ATHLETE` and the table shows it, but an athlete has no account
   * to write through — the portal is §21 and is not built. Accepting a claimed
   * author from this procedure would be inventing that authorization path.
   */
  setNutritionValue: withCoachPermission('athlete:write')
    .input(
      z.object({
        athleteId: z.string().min(1).max(64),
        measurementTypeKey: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[a-z0-9_]+$/),
        day: z.date(),
        value: z.number().finite().min(0).max(100000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await setNutritionValue(
        ctx.db,
        ctx.tenant,
        { by: 'COACH', coachId: ctx.coach.id },
        input,
      );

      if (!result.ok) throw notFound();

      return result;
    }),

  /**
   * The order the cards sit in.
   *
   * A whole list rather than a move-by-one, because a drag is a move to an
   * arbitrary position and expressing it as a sequence of swaps would make the
   * stored order depend on how many round trips survived.
   */
  setTrendCardOrder: withPermission('athlete:write')
    .input(
      z.object({
        athleteId: z.string().min(1).max(64),
        keys: z
          .array(
            z
              .string()
              .trim()
              .min(1)
              .max(40)
              .regex(/^[a-z0-9_]+$/),
          )
          .max(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ok = await setTrendCardOrder(ctx.db, ctx.tenant, input.athleteId, input.keys);
      if (!ok) throw notFound();

      return { ok: true };
    }),

  /**
   * One athlete's biofeedback week.
   *
   * Its own procedure for the same reason the nutrition week has one: the trend
   * charts draw a quantity over time, this is a table of one week that is
   * written into.
   */
  biofeedbackWeek: withPermission('athlete:read')
    .input(z.object({ athleteId: z.string().min(1).max(64), weekStart: z.date() }))
    .query(async ({ ctx, input }) => {
      const week = await biofeedbackWeek(ctx.db, ctx.tenant, input.athleteId, input.weekStart);
      if (week === null) throw notFound();

      return week;
    }),

  /**
   * Sets one cell of that table.
   *
   * `withCoachPermission` because the entry records who put it there (§13).
   * **The athlete's own writing is not here**: the model carries
   * `recordedBy: ATHLETE` and the table shows it, but an athlete has no account
   * to write through — the portal is §21 and is not built. Accepting a claimed
   * author from this procedure would be inventing that authorization path.
   */
  setBiofeedbackValue: withCoachPermission('athlete:write')
    .input(
      z.object({
        athleteId: z.string().min(1).max(64),
        measurementTypeKey: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[a-z0-9_]+$/),
        day: z.date(),
        value: z.number().finite().min(0).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await setBiofeedbackValue(
        ctx.db,
        ctx.tenant,
        { by: 'COACH', coachId: ctx.coach.id },
        input,
      );

      if (!result.ok) {
        if (result.refusal === 'OUT_OF_SCALE') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Der Wert liegt außerhalb der Skala dieser Messgröße.',
          });
        }

        throw notFound();
      }

      return result;
    }),

  /** The remark on one entry — why the value is what it is. */
  setBiofeedbackNote: withPermission('athlete:write')
    .input(
      z.object({
        entryId: z.string().min(1).max(64),
        note: z.string().trim().max(500).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ok = await setBiofeedbackNote(
        ctx.db,
        ctx.tenant,
        input.entryId,
        input.note,
        // A coach reaches every athlete of their workspace (§21).
        null,
      );
      if (!ok) throw notFound();

      return { ok: true };
    }),

  /** Empties one cell of the biofeedback table. */
  clearBiofeedbackValue: withPermission('athlete:write')
    .input(z.object({ entryId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const ok = await clearBiofeedbackValue(
        ctx.db,
        ctx.tenant,
        input.entryId,
        // A coach reaches every athlete of their workspace (§21).
        null,
      );
      if (!ok) throw notFound();

      return { ok: true };
    }),

  /** Which rows this athlete's biofeedback card shows, in the coach's order. */
  setBiofeedbackRows: withPermission('athlete:write')
    .input(
      z.object({
        athleteId: z.string().min(1).max(64),
        keys: z
          .array(
            z
              .string()
              .trim()
              .min(1)
              .max(40)
              .regex(/^[a-z0-9_]+$/),
          )
          .max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await setBiofeedbackRows(ctx.db, ctx.tenant, input.athleteId, input.keys);
      if (!result.ok) throw notFound();

      return result;
    }),

  /**
   * Adds a quantity of the workspace's own and puts it on the card.
   *
   * `withCoachPermission`: it writes to the workspace catalogue, which is a
   * decision about the practice and not about one athlete.
   */
  addBiofeedbackQuantity: withCoachPermission('athlete:write')
    .input(
      z.object({
        athleteId: z.string().min(1).max(64),
        name: z.string().trim().min(1).max(60),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await addBiofeedbackQuantity(ctx.db, ctx.tenant, input.athleteId, input.name);

      if (!result.ok) {
        if (result.refusal === 'NAME_UNUSABLE') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Dieser Name ergibt keine Messgröße. Bitte Buchstaben oder Ziffern verwenden.',
          });
        }
        if (result.refusal === 'TOO_MANY_ROWS') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Diese Tabelle fasst nicht mehr Zeilen.',
          });
        }

        throw notFound();
      }

      return result;
    }),

  /** Empties one cell. Deleted, never superseded — see §13. */
  clearNutritionValue: withPermission('athlete:write')
    .input(z.object({ entryId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const ok = await clearNutritionValue(
        ctx.db,
        ctx.tenant,
        input.entryId,
        // A coach reaches every athlete of their workspace (§21).
        null,
      );
      if (!ok) throw notFound();

      return { ok: true };
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
  /**
   * One athlete's files and the shelves they sit on (§18).
   *
   * The coach's door onto the same services the portal uses. What differs is
   * only the question asked first: a coach reaches every athlete of their
   * workspace, so the athlete arrives as an input here and is resolved from the
   * session there. Sharing the *authorisation* between the two would give one
   * side the other's reach.
   */
  files: withPermission('athlete:read')
    .input(athleteIdSchema)
    .query(async ({ ctx, input }) => {
      const [folders, assets] = await Promise.all([
        listFolders(ctx.db, ctx.tenant, input.athleteId),
        listAthleteAssets(ctx.db, ctx.tenant, input.athleteId),
      ]);

      return { folders, assets };
    }),

  /** `withCoachPermission`, because the shelf records who put it there (§18). */
  createAssetFolder: withCoachPermission('athlete:write')
    .input(athleteIdSchema.extend({ name: folderNameSchema }))
    .mutation(async ({ ctx, input }) => {
      const result = await createFolder(
        ctx.db,
        ctx.tenant,
        input.athleteId,
        input.name,
        ctx.coach.id,
      );

      if (!result.ok) throw folderRefusal(result.refusal);

      return result.value;
    }),

  renameAssetFolder: withPermission('athlete:write')
    .input(athleteIdSchema.extend({ folderId: assetIdSchema, name: folderNameSchema }))
    .mutation(async ({ ctx, input }) => {
      const result = await renameFolder(
        ctx.db,
        ctx.tenant,
        input.athleteId,
        input.folderId,
        input.name,
      );

      if (!result.ok) throw folderRefusal(result.refusal);

      return { ok: true };
    }),

  /** Removes the shelf. What stood on it stays, loose (§18). */
  deleteAssetFolder: withPermission('athlete:write')
    .input(athleteIdSchema.extend({ folderId: assetIdSchema }))
    .mutation(async ({ ctx, input }) => {
      if (!(await deleteFolder(ctx.db, ctx.tenant, input.athleteId, input.folderId))) {
        throw notFound();
      }

      return { ok: true };
    }),

  /**
   * Deletes one file for good.
   *
   * Through `services/assets/deletion.ts`, never around it: whether a file may
   * go is a question about running analyses, findings and frozen documents, and
   * that question has one answer for both doors (§18).
   */
  deleteAssetFile: withPermission('athlete:write')
    .input(athleteIdSchema.extend({ assetId: assetIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const own = await assetForDownload(ctx.db, ctx.tenant, input.athleteId, input.assetId);
      if (!own) throw notFound();

      const result = await deleteAsset(ctx.db, ctx.tenant, input.assetId);

      if (result.status === 'DELETED') return { ok: true };

      throw assetRefusal(result.status);
    }),

  /**
   * Opens a stored video as the source of a video analysis (§18).
   *
   * ## What this is not
   *
   * A second analysis. The pipeline is the one that already exists — what
   * changes is only where the bytes come from, and this procedure is the part
   * that must not live in a browser: **which asset, and may this coach have
   * it.** The client names an asset id; the storage key is resolved here and
   * never travels back.
   *
   * ## Why it takes no hold
   *
   * It is read by the page while it renders, and **a render must not change
   * anything**. It did take the lease here once, and the browser QA showed
   * exactly why that is wrong: every Server Action from this screen makes Next
   * re-render the page, so the release fired, the page re-rendered, and the
   * re-render took the hold straight back. The hold is now taken deliberately,
   * once, by `startAnalysis` when the browser actually loads the video.
   */
  analysisSource: withCoachPermission('athlete:write')
    .input(athleteIdSchema.extend({ assetId: assetIdSchema }))
    .query(async ({ ctx, input }) => {
      const resolved = await analysisSourceFor(ctx.db, ctx.tenant, input.athleteId, input.assetId);

      if (!resolved.ok) throw analysisRefusal(resolved.refusal);

      // The key stays here. What the browser gets is a name and a size.
      return {
        assetId: resolved.source.assetId,
        fileName: resolved.source.fileName,
        mimeType: resolved.source.mimeType,
        sizeBytes: resolved.source.sizeBytes,
      };
    }),

  /**
   * Takes the hold on a stored video, for one analysis that is starting (§18).
   *
   * Asked once, by the screen, at the moment it fetches the bytes — not while
   * the page renders, so that re-rendering the page (which Next does after
   * every Server Action) cannot silently re-take a hold that was just released.
   *
   * The athlete and the workspace are checked again here rather than trusted
   * from the earlier read: this is a write, and a write authorises itself.
   */
  startAnalysis: withCoachPermission('athlete:write')
    .input(athleteIdSchema.extend({ assetId: assetIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const resolved = await analysisSourceFor(ctx.db, ctx.tenant, input.athleteId, input.assetId);

      if (!resolved.ok) throw analysisRefusal(resolved.refusal);

      /**
       * Take the hold, or find out somebody already has it.
       *
       * One statement, with the condition inside it — two coaches opening the
       * same recording at the same moment cannot both succeed, and neither can
       * a start that races a deletion.
       */
      if (!(await startAnalysisLease(ctx.db, ctx.tenant, resolved.source.assetId))) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Dieses Video wird bereits ausgewertet.',
        });
      }

      return { ok: true };
    }),

  /**
   * Keeps the hold alive while the screen is open (§18).
   *
   * A lease that never expired would block a deletion for ever after one closed
   * tab; one that expires needs saying so periodically. This only extends a
   * hold that is genuinely running — it cannot revive one that was ended or
   * swept.
   */
  heartbeatAnalysis: withCoachPermission('athlete:write')
    .input(z.object({ assetId: assetIdSchema }))
    .mutation(async ({ ctx, input }) => ({
      held: await heartbeatAnalysisLease(ctx.db, ctx.tenant, input.assetId),
    })),

  /**
   * Ends the analysis and lets the video go (§18).
   *
   * Called on every way out — finished, abandoned, failed — so a refusal to
   * delete never outlives the reason for it. The outcome is kept, because an
   * analysis that failed is worth knowing about; neither outcome protects the
   * file any longer.
   *
   * Deliberately forgiving: ending something that was not held is not an error.
   */
  releaseAnalysisSource: withCoachPermission('athlete:write')
    .input(
      z.object({
        assetId: assetIdSchema,
        outcome: z.enum(['FINISHED', 'FAILED']).default('FINISHED'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await endAnalysisLease(ctx.db, ctx.tenant, input.assetId, input.outcome);

      return { ok: true };
    }),

  /**
   * Permission to write **one** object, for a file too big for a request (§18).
   *
   * The coach half of the resumable path. Everything the upload will use is
   * decided here, where the caller is already known, and travels in a signed
   * ticket the browser cannot edit: the workspace, the athlete, the storage
   * key, the type and the length. The client chooses none of them.
   */
  createUploadTicket: withCoachPermission('athlete:write')
    .input(athleteIdSchema.extend(UPLOAD_SHAPE))
    .mutation(async ({ ctx, input }) => {
      const athlete = await getAthlete(ctx.db, ctx.tenant, input.athleteId);
      if (!athlete) throw notFound();

      const prepared = prepareResumableUpload({
        athleteId: athlete.id,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      });

      if (!prepared.ok) throw uploadRefusal(prepared.refusal);

      return {
        ticket: issueUploadTicket({
          organizationId: ctx.tenant.organizationId,
          athleteId: athlete.id,
          storageKey: prepared.storageKey,
          mimeType: prepared.mimeType,
          sizeBytes: input.sizeBytes,
          fileName: input.fileName,
          folderId: input.folderId ?? null,
          uploadedByCoachId: ctx.coach.id,
        }),
      };
    }),

  /**
   * Files the row once the bytes are in the store.
   *
   * The ticket says what was authorised; the **store** says whether it actually
   * happened. Registering without having uploaded finds no object and writes
   * nothing (§18).
   */
  registerUpload: withCoachPermission('athlete:write')
    .input(z.object({ ticket: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const ticket = readUploadTicket(input.ticket);

      // A ticket is bound to the workspace it was issued in. Re-checked rather
      // than trusted, so one that leaked cannot be spent somewhere else.
      if (ticket?.organizationId !== ctx.tenant.organizationId) throw notFound();

      const result = await registerUploadedAsset(ctx.db, ctx.tenant, ticket);
      if (!result.ok) throw uploadRefusal(result.refusal);

      return result;
    }),

  /**
   * Proves the coach may put a file on this record, and says who is filing it.
   *
   * The bytes travel in a server action rather than through tRPC, exactly as
   * analysis stills already do. What must not live in an action is the
   * permission — so it lives here, and the action calls this first.
   */
  fileUploadTarget: withCoachPermission('athlete:write')
    .input(athleteIdSchema)
    .mutation(async ({ ctx, input }) => {
      const athlete = await getAthlete(ctx.db, ctx.tenant, input.athleteId);
      if (!athlete) throw notFound();

      return { athleteId: athlete.id, uploadedByCoachId: ctx.coach.id };
    }),

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
