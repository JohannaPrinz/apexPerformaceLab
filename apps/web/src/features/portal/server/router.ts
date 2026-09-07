import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { readTrendCards } from '@apex/domain';

import {
  athleteProcedure,
  createTRPCRouter,
  publicProcedure,
  withCoachPermission,
  withPermission,
} from '@/server/api/trpc';

import {
  activationTokenSchema,
  issueActivationSchema,
  redeemActivationSchema,
  revokeActivationSchema,
} from '../schemas';

import {
  type IssueRefusal,
  type RedeemRefusal,
  issueActivation,
  redeemActivation,
  resolveActivation,
  revokeActivations,
  standingActivation,
} from './activation';
import { portalFilesProcedures } from './files-router';
import { sharedReportFor, sharedReportsFor } from './reports';
import { portalTrackingProcedures } from './tracking-router';

/**
 * The athlete portal's API surface (§21).
 *
 * Two audiences, and they meet nowhere:
 *
 * - **The Coach** issues and withdraws access. `withCoachPermission` puts those
 *   behind a session, a workspace and `athlete:write` — the same gate that
 *   guards editing an athlete, because granting someone access to a record is
 *   an act on that record.
 * - **The Athlete** redeems a link, and by definition has no session yet. That
 *   procedure is public, and its authorization is the token itself.
 *
 * Nothing here can create an Athlete. Activation only ever acts on a row a
 * Coach created.
 */

/** What a coach is told, in their language, when a link cannot be issued. */
const ISSUE_MESSAGES: Readonly<Record<IssueRefusal, string>> = {
  NOT_FOUND: 'Dieser Athlet wurde nicht gefunden.',
  ALREADY_ACTIVE: 'Dieser Athlet hat bereits einen Zugang.',
  ARCHIVED: 'Dieser Athlet ist deaktiviert. Bitte zuerst wieder aktivieren.',
  NO_EMAIL: 'Für diesen Athleten ist keine E-Mail-Adresse hinterlegt.',
};

/**
 * What the athlete is told when a link will not open.
 *
 * Each names itself. "Link ungültig" would send somebody asking their coach a
 * question the page could have answered — and the four causes need four
 * different next steps.
 */
export const REDEEM_MESSAGES: Readonly<Record<RedeemRefusal, string>> = {
  UNKNOWN: 'Dieser Link ist nicht gültig. Bitte fragen Sie nach einem neuen.',
  EXPIRED: 'Dieser Link ist abgelaufen. Ihr Coach kann Ihnen einen neuen schicken.',
  USED: 'Dieser Link wurde bereits verwendet. Bitte melden Sie sich mit Ihrem Passwort an.',
  REVOKED: 'Dieser Link wurde zurückgezogen. Bitte wenden Sie sich an Ihren Coach.',
  ALREADY_ACTIVE: 'Für diesen Zugang gibt es bereits ein Konto. Bitte melden Sie sich an.',
  EMAIL_TAKEN:
    'Zu dieser E-Mail-Adresse gibt es bereits ein Konto. Ihr Coach kann den Zugang mit einer anderen Adresse einrichten.',
};

export const portalRouter = createTRPCRouter({
  ...portalTrackingProcedures,
  ...portalFilesProcedures,

  /**
   * The athlete's own record, for the athlete.
   *
   * Takes no input at all — there is nothing to ask for but "mine". What comes
   * back is the master data to **read** and the list of cards the coach put on
   * the profile; §21 keeps editing the master data with the coach, because
   * height, weight, sex and date of birth are inputs to their calculations.
   *
   * The card list is the coach's configuration and the portal follows it rather
   * than offering all three unconditionally: which quantities are worth
   * following is a coaching decision, and a portal that added its own would be
   * overruling it.
   */
  me: athleteProcedure.query(async ({ ctx }) => {
    const athlete = await ctx.db.athlete.findFirst({
      where: { id: ctx.athlete.id, organizationId: ctx.tenant.organizationId },
      select: {
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        sex: true,
        email: true,
        phone: true,
        heightCm: true,
        weightKg: true,
        archivedAt: true,
        trendCards: true,
        organization: { select: { name: true } },
      },
    });

    if (!athlete) throw new TRPCError({ code: 'NOT_FOUND', message: 'Nicht gefunden.' });

    return {
      ...athlete,
      // `Decimal` does not survive the wire as a number on its own.
      heightCm: athlete.heightCm === null ? null : Number(athlete.heightCm),
      weightKg: athlete.weightKg === null ? null : Number(athlete.weightKg),
      cards: readTrendCards(athlete.trendCards),
    };
  }),

  /**
   * The analyses the coach has shared with this athlete (§17, §21).
   *
   * No input: "mine" is the only question there is. What makes one appear here
   * is the coach's own share — the same control, the same withdrawal, the same
   * expiry — so nothing about who sees what moves into the portal.
   */
  sharedReports: athleteProcedure.query(({ ctx }) =>
    sharedReportsFor(ctx.db, ctx.tenant, ctx.athlete.id),
  ),

  /**
   * One of them, frozen as it was published (§16).
   *
   * The id arrives from the client and decides nothing on its own: the filter
   * carries the workspace, the athlete and an active share as well.
   */
  sharedReport: athleteProcedure
    .input(z.object({ reportId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const report = await sharedReportFor(ctx.db, ctx.tenant, ctx.athlete.id, input.reportId);
      if (!report) throw new TRPCError({ code: 'NOT_FOUND', message: 'Nicht gefunden.' });

      return report;
    }),

  /**
   * Creates a link for one existing athlete and returns the token **once**.
   *
   * The token is never stored and never readable again — only its hash is kept
   * — so this return value is the only moment it exists outside the message.
   */
  issueActivation: withCoachPermission('athlete:write')
    .input(issueActivationSchema)
    .mutation(async ({ ctx, input }) => {
      const issued = await issueActivation(ctx.db, ctx.tenant, ctx.coach.id, input.athleteId);

      if (!issued.ok) {
        throw new TRPCError({
          code: issued.reason === 'NOT_FOUND' ? 'NOT_FOUND' : 'PRECONDITION_FAILED',
          message: ISSUE_MESSAGES[issued.reason],
        });
      }

      // The name the message is signed with. Read from the session rather
      // than passed in, so a coach cannot sign as somebody else.
      return { ...issued, coachName: ctx.session.user.name };
    }),

  /**
   * Whether an offer of access is open for this athlete, and until when.
   *
   * `withPermission`, not `withCoachPermission`: reading who has been offered
   * access is not an act on the record.
   */
  standing: withPermission('athlete:read')
    .input(issueActivationSchema)
    .query(({ ctx, input }) => standingActivation(ctx.db, ctx.tenant, input.athleteId)),

  /** Withdraws every link still standing. Withdrawing twice is not an error. */
  revokeActivation: withCoachPermission('athlete:write')
    .input(revokeActivationSchema)
    .mutation(async ({ ctx, input }) => ({
      revoked: await revokeActivations(ctx.db, ctx.tenant, input.athleteId),
    })),

  /**
   * What a link opens, for the page that renders it.
   *
   * Public for the same reason as the redemption below. It answers with the
   * athlete's name and address so they can see the link is meant for them
   * before they type a password into it — and with nothing else about the
   * record. A token that does not open returns the reason rather than throwing,
   * because "abgelaufen" and "bereits verwendet" need different next steps.
   */
  activation: publicProcedure.input(activationTokenSchema).query(async ({ ctx, input }) => {
    const resolved = await resolveActivation(ctx.db, input.token);

    if (!resolved.ok) return { open: false as const, message: REDEEM_MESSAGES[resolved.reason] };

    return {
      open: true as const,
      firstName: resolved.activation.firstName,
      lastName: resolved.activation.lastName,
      email: resolved.activation.email,
    };
  }),

  /**
   * Sets the first password and links the account to the existing Athlete.
   *
   * **Public by necessity.** Whoever holds the link has no account yet, so
   * there is no session to authorize against; the token is the credential. See
   * `resolveActivation` for why that is sound, and note what this procedure
   * does *not* accept: no athlete, no workspace, no e-mail address. Everything
   * that decides which record is touched comes from the row the token finds.
   */
  redeemActivation: publicProcedure
    .input(redeemActivationSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await redeemActivation(ctx.db, input.token, input.password);

      if (!result.ok) {
        throw new TRPCError({ code: 'FORBIDDEN', message: REDEEM_MESSAGES[result.reason] });
      }

      return result;
    }),
});
