'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import type { DraftField } from '@apex/domain';

import { env } from '@/env';
import { sendEmail } from '@/integrations/email';
import { api } from '@/trpc/server';

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

/** Where an assessment's analyses are shown: the list, each one, and the assessment. */
const refreshAnalyses = (assessmentId: string) => {
  revalidatePath(`/assessments/${assessmentId}/auswertung`, 'layout');
  revalidatePath(`/assessments/${assessmentId}`);
};

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

  refreshAnalyses(assessmentId);

  return { status: 'idle' };
}

export interface AnalysisCreated extends AnalysisActionState {
  /** The draft that now exists, so the screen can open it. */
  readonly reportId?: string;
}

/**
 * Creates a draft analysis.
 *
 * A deliberate click, never a side effect of opening the section: an analysis
 * is a document with a version number, and one that appeared because somebody
 * looked at a page would be a document nobody decided to write.
 *
 * `reuseOpenDraft` is for completing an assessment, which asks every time and
 * must not pile up drafts. "Neue Auswertung" leaves it off and always gets a
 * new one — several analyses over different tests are what it is for.
 */
export async function createAnalysisAction(
  assessmentId: string,
  title: string,
  options: { readonly reuseOpenDraft?: boolean } = {},
): Promise<AnalysisCreated> {
  let reportId: string;

  try {
    const created = await api.reports.create({
      assessmentId,
      title,
      reuseOpenDraft: options.reuseOpenDraft ?? false,
    });
    reportId = created.id;
  } catch (error) {
    return failed(error, 'Die Auswertung konnte nicht angelegt werden.');
  }

  refreshAnalyses(assessmentId);

  return { status: 'idle', reportId };
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
 * Deletes an analysis that was never shared.
 *
 * A shared one is refused by the procedure — it can only be archived, because
 * the athlete holds it.
 */
export async function deleteAnalysisAction(
  assessmentId: string,
  reportId: string,
): Promise<AnalysisActionState> {
  try {
    await api.reports.deleteDraft({ reportId });
  } catch (error) {
    return failed(error, 'Die Auswertung konnte nicht gelöscht werden.');
  }

  refreshAnalyses(assessmentId);

  return { status: 'idle' };
}

/** Archives a shared analysis, which ends every link the athlete holds to it. */
export async function archiveAnalysisAction(
  assessmentId: string,
  reportId: string,
): Promise<AnalysisActionState> {
  try {
    await api.reports.archive({ reportId });
  } catch (error) {
    return failed(error, 'Die Auswertung konnte nicht archiviert werden.');
  }

  refreshAnalyses(assessmentId);

  return { status: 'idle' };
}

export interface ShareCreated extends AnalysisActionState {
  readonly share?: {
    readonly url: string;
    readonly expiresAt: string;
    /** Where both messages went. */
    readonly recipient: string;
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
 * ## Why two messages
 *
 * A link and the password that opens it in one mailbox is one interception away
 * from being no protection at all, so they are two messages. They currently go
 * out together: this sends through a mailbox over SMTP, which hands a message
 * over for immediate delivery and cannot hold one back. Spacing them would need
 * the second message kept somewhere and a job to release it.
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
  /**
   * An address, where the athlete has none on file.
   *
   * Empty in the ordinary case. Supplied it is stored on the record, so the
   * coach is asked once rather than once per document (§7, §21).
   */
  email?: string,
): Promise<ShareCreated> {
  try {
    const share = await api.reports.createShare({
      reportId,
      days,
      password,
      ...(email === undefined || email.trim() === '' ? {} : { email: email.trim() }),
    });

    /**
     * Read the document this link opens, not the draft and not "the newest".
     *
     * Sharing is what froze it, so it has to be read afterwards — and by its own
     * id: an assessment can hold several analyses, and the message must be
     * signed and dated by the one that went out. The snapshot carries the name,
     * the author and the date, frozen with the document.
     */
    const snapshot = await api.reports.snapshot({ reportId });

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

    refreshAnalyses(assessmentId);

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

    const recipient = share.recipient ?? '';

    /**
     * The link first, then the password — one after the other rather than at
     * once. A mailbox expects one conversation at a time, and the order means
     * the message carrying the link is the one that gets through when a send
     * limit is reached. A password with no link behind it helps nobody.
     */
    const sentLink = await sendEmail({
      to: recipient,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    const sentPassword = await sendEmail({
      to: recipient,
      subject: secret.subject,
      text: secret.text,
    });

    return {
      status: 'idle',
      share: {
        url,
        expiresAt: share.expiresAt.toISOString(),
        recipient,
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

  refreshAnalyses(assessmentId);

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
