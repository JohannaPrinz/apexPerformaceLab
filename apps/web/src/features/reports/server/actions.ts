'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import type { DraftField } from '@apex/domain';

import { env } from '@/env';
import { api } from '@/trpc/server';

import { shareMessage } from './share-message';

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
    /** Shown once. Only its hash is stored; nothing can display it again. */
    readonly password: string;
    readonly expiresAt: string;
    readonly message: { subject: string; text: string; mailto: string };
  };
}

/**
 * Grants access and composes the message that carries it.
 *
 * The message is **composed, not sent**: there is no mail transport in this
 * system and no sender domain has been decided. Handing it to the coach's own
 * mail client is not a placeholder for that — it puts the coach's own address on
 * correspondence the athlete already recognises, which no receiving server has
 * reason to distrust.
 */
export async function createShareAction(
  assessmentId: string,
  reportId: string,
  days: number,
  withOffer: boolean,
): Promise<ShareCreated> {
  try {
    const [share, evaluation] = await Promise.all([
      api.reports.createShare({ reportId, days }),
      api.reports.evaluation({ assessmentId }),
    ]);

    const origin = (await headers()).get('origin') ?? env.NEXT_PUBLIC_APP_URL;
    const url = `${origin}/geteilt/${share.token}`;

    const message = shareMessage({
      athleteFirstName: evaluation?.athlete.firstName ?? '',
      coachName: evaluation?.coachName ?? 'Dein Coach',
      performedAt: evaluation?.assessment.performedAt ?? new Date(),
      expiresAt: share.expiresAt,
      url,
      withOffer,
    });

    revalidatePath(`/assessments/${assessmentId}/auswertung`);

    return {
      status: 'idle',
      share: {
        url,
        password: share.password,
        expiresAt: share.expiresAt.toISOString(),
        message: {
          subject: message.subject,
          text: message.text,
          mailto: `mailto:?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.text)}`,
        },
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
