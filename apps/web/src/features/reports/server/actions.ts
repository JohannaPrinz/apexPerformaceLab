'use server';

import { revalidatePath } from 'next/cache';

import { api } from '@/trpc/server';

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
  text: string,
): Promise<AnalysisActionState> {
  try {
    await api.reports.updateDraftText({ reportId, target, text });
  } catch (error) {
    return failed(error, 'Der Text konnte nicht gespeichert werden.');
  }

  return { status: 'idle' };
}

/**
 * Regenerates one text from the values as they stand.
 *
 * The only action that replaces something the coach may have written, and it
 * runs because they pressed the button that says so.
 */
export async function regenerateDraftAction(
  reportId: string,
  target: DraftTargetInput,
): Promise<AnalysisActionState> {
  try {
    await api.reports.regenerateDraftText({ reportId, target });
  } catch (error) {
    return failed(error, 'Der Text konnte nicht neu erzeugt werden.');
  }

  return { status: 'idle' };
}
