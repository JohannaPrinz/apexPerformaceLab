'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import type { DraftField } from '@apex/domain';

import { env } from '@/env';
import { sendEmail } from '@/integrations/email';
import { api } from '@/trpc/server';

import { PASSWORD_DELAY_MINUTES } from '../schemas';

import { passwordMessage, shareMessage } from './share-message';

/**
 * Form entry points for the analysis section.
 *
 * Thin by design: the rules are in the service and the procedure. What these
 * own is turning a refusal into a sentence the section can show, and telling
 * Next.js which page to re-read.
 */
export interface AnalysisActionState {
  readonly status: 'idle' | 'error';
  readonly message?: string;
}

const failed = (error: unknown, fallback: string): AnalysisActionState => ({
  status: 'error',
  message: error instanceof Error ? error.message : fallback,
});

/**
 * Includes or excludes one test **for this analysis**.
 *
 * The test itself is never written — that guarantee lives in
 * `setReportModuleInclusion` and is asserted against the queries in
 * `service.test.ts`. Nothing here may add a second write beside it.
 */
export async function setAnalysisModuleAction(
  assessmentId: string,
  reportId: string,
  moduleId: string,
  included: boolean,
): Promise<AnalysisActionState> {
  try {
    await api.reports.setModuleInclusion({ reportId, moduleId, included });
  } catch (error) {
    return failed(error, 'Die Auswahl konnte nicht gespeichert werden.');
  }

  revalidatePath(`/assessments/${assessmentId}`);

  return { status: 'idle' };
}

/**
 * Creates the draft analysis.
 *
 * A deliberate click, never a side effect of opening the section: an analysis
 * is a document with a version number, and one that appeared because somebody
 * looked at a page would be a document nobody decided to write.
 */
export async function createAnalysisAction(
  assessmentId: string,
  title: string,
): Promise<AnalysisActionState> {
  try {
    await api.reports.create({ assessmentId, title });
  } catch (error) {
    return failed(error, 'Die Auswertung konnte nicht angelegt werden.');
  }

  revalidatePath(`/assessments/${assessmentId}`);

  return { status: 'idle' };
}

/** Which text of a draft an action addresses. */
export type DraftTargetInput = { kind: 'overall' } | { kind: 'section'; moduleId: string };

/**
 * Stores what the coach wrote into one text.
 *
 * No `revalidatePath`: the editor keeps what is in the box and refreshes the
 * route itself once the write returns. Revalidating here as well would pull the
 * text back through the server while the coach may already be typing in the
 * next field.
 */
export async function updateDraftTextAction(
  reportId: string,
  target: DraftTargetInput,
  field: DraftField,
  text: string,
): Promise<AnalysisActionState> {
  try {
    await api.reports.updateDraftText({ reportId, target, field, text });
  } catch (error) {
    return failed(error, 'Der Text konnte nicht gespeichert werden.');
  }

  return { status: 'idle' };
}

/**
 * Freezes the analysis.
 *
 * The point of no return (§16), so it revalidates: every screen that showed a
 * draft now shows a document.
 */
export async function publishReportAction(
  assessmentId: string,
  reportId: string,
): Promise<AnalysisActionState> {
  try {
    await api.reports.publish({ reportId });
  } catch (error) {
    return failed(error, 'Die Auswertung konnte nicht abgeschlossen werden.');
  }

  revalidatePath(`/assessments/${assessmentId}/auswertung`);
  revalidatePath(`/assessments/${assessmentId}`);

  return { status: 'idle' };
}

export interface ShareCreated extends AnalysisActionState {
  readonly share?: {
    readonly url: string;
    readonly expiresAt: string;
    /** Where both messages went. */
    readonly recipient: string;
    /** When the second one is due, so the screen can say it rather than imply it. */
    readonly passwordDueAt: string;
    /**
     * What the athlete will not receive, and why.
     *
     * The link exists either way — a message that failed to send is not a reason
     * to withhold access the coach already granted. Named so they can pass it on
     * themselves instead of assuming it arrived.
     */
    readonly undelivered?: { readonly link: string | null; readonly password: string | null };
  };
}

/**
 * Grants access and sends it to the athlete.
 *
 * ## Why two messages, a quarter of an hour apart
 *
 * A link and the password that opens it in one mailbox is one interception away
 * from being no protection at all. So the link goes now and the password
 * follows, held by the provider — long enough that they do not land together,
 * short enough that nobody waits on it.
 *
 * ## Why a failed message does not undo the link
 *
 * Access is a decision the coach made; delivery is a separate matter that can
 * fail for reasons that have nothing to do with it — a bounced mailbox, an
 * unconfigured sender. The link therefore stands, and what did not arrive is
 * named so the coach can pass it on themselves.
 */
export async function createShareAction(
  assessmentId: string,
  reportId: string,
  days: number,
  /** The password the coach chose. Only its hash is stored. */
  password: string,
): Promise<ShareCreated> {
  try {
    /**
     * Read the published document, not the draft.
     *
     * Sharing happens *after* publication, and by then there is no draft: asking
     * for one returned nothing, and the message went out addressed to nobody,
     * signed by nobody and dated today. The snapshot carries all three, frozen
     * with the document the link opens.
     */
    const [share, snapshot] = await Promise.all([
      api.reports.createShare({ reportId, days, password }),
      api.reports.publishedSnapshot({ assessmentId }),
    ]);

    const origin = (await headers()).get('origin') ?? env.NEXT_PUBLIC_APP_URL;
    const url = `${origin}/geteilt/${share.token}`;

    const message = shareMessage({
      athleteFirstName: snapshot?.athlete.firstName ?? '',
      coachName: snapshot?.coach.name ?? 'Dein Coach',
      performedAt: snapshot === null ? new Date() : new Date(snapshot.assessment.performedAt),
      expiresAt: share.expiresAt,
      url,
      // Always. The message is what an athlete gets after a single examination,
      // and the point of the offer is that a second one says what the first
      // cannot — see `shareMessage`.
      withOffer: true,
    });

    revalidatePath(`/assessments/${assessmentId}/auswertung`);

    /**
     * The password travels separately, on purpose.
     *
     * A link and the password that opens it in one message is one intercepted
     * mailbox away from being no protection at all. So there are two texts: the
     * one with the link, and a short one the coach sends by another route.
     */
    const secret = passwordMessage({
      athleteFirstName: snapshot?.athlete.firstName ?? '',
      coachName: snapshot?.coach.name ?? 'Dein Coach',
      password,
    });

    const passwordDueAt = new Date(Date.now() + PASSWORD_DELAY_MINUTES * 60_000);
    const recipient = share.recipient ?? '';

    const [sentLink, sentPassword] = await Promise.all([
      sendEmail({
        to: recipient,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      sendEmail({
        to: recipient,
        subject: secret.subject,
        text: secret.text,
        sendAt: passwordDueAt,
      }),
    ]);

    return {
      status: 'idle',
      share: {
        url,
        expiresAt: share.expiresAt.toISOString(),
        recipient,
        passwordDueAt: passwordDueAt.toISOString(),
        ...(sentLink.ok && sentPassword.ok
          ? {}
          : {
              undelivered: {
                link: sentLink.ok ? null : sentLink.message,
                password: sentPassword.ok ? null : sentPassword.message,
              },
            }),
      },
    };
  } catch (error) {
    return failed(error, 'Der Link konnte nicht erstellt werden.');
  }
}

/** Withdraws access. The row survives as part of the audit trail (§17). */
export async function revokeShareAction(
  assessmentId: string,
  shareId: string,
): Promise<AnalysisActionState> {
  try {
    await api.reports.revokeShare({ shareId });
  } catch (error) {
    return failed(error, 'Der Zugang konnte nicht zurückgezogen werden.');
  }

  revalidatePath(`/assessments/${assessmentId}/auswertung`);

  return { status: 'idle' };
}

/**
 * Adds or removes one still from the document.
 *
 * A choice about *this* analysis, like the sentence beside it — which is why it
 * writes to the draft and not to the video analysis. A still nobody chose is
 * never copied at publication and expires with the rest.
 */
export async function setStillAction(
  reportId: string,
  moduleId: string,
  key: string,
  chosen: boolean,
): Promise<AnalysisActionState> {
  try {
    await api.reports.setStill({ reportId, moduleId, key, chosen });
    revalidatePath('/assessments', 'layout');

    return { status: 'idle' };
  } catch (error) {
    return failed(error, 'Das Standbild konnte nicht übernommen werden.');
  }
}
