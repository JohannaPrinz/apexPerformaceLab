'use server';

import { revalidatePath } from 'next/cache';

import { TRPCError } from '@trpc/server';

import { moduleConfigurationSchema, moduleKeySchema } from '@apex/domain';

import { api } from '@/trpc/server';

import { createAssessmentSchema } from '../schemas';

/** Thin callers. Authorization lives in the procedures. */

export interface AssessmentFormState {
  errors?: Record<string, string>;
  message?: string;
  assessmentId?: string;
}

export async function createAssessmentAction(
  _previous: AssessmentFormState,
  formData: FormData,
): Promise<AssessmentFormState> {
  const parsed = createAssessmentSchema.safeParse({
    athleteId: formData.get('athleteId'),
    question: formData.get('question'),
    type: formData.get('type') ?? undefined,
    // Set when the dialog was opened inside an engagement. Absent otherwise,
    // and then §8 applies unchanged: the service adopts or opens one.
    caseId: formData.get('caseId') ?? undefined,
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !errors[key]) errors[key] = issue.message;
    }

    return { errors };
  }

  try {
    const assessment = await api.assessments.create(parsed.data);
    revalidatePath(`/athletes/${parsed.data.athleteId}`);

    return { assessmentId: assessment.id };
  } catch (error) {
    return { message: toMessage(error) };
  }
}

export async function addModuleAction(
  assessmentId: string,
  name: string,
  moduleKey: string,
  templateKey: string | undefined,
): Promise<{ message?: string }> {
  const key = moduleKeySchema.safeParse(moduleKey);
  if (!key.success) return { message: 'Unbekannter Testtyp.' };
  if (name.trim() === '') return { message: 'Bitte einen Namen für den Test eingeben.' };

  try {
    await api.assessments.addModule({
      assessmentId,
      name: name.trim(),
      moduleKey: key.data,
      ...(templateKey ? { templateKey: templateKey as never } : { configuration: undefined }),
    });
    revalidatePath(`/assessments/${assessmentId}`);

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/**
 * Adds a test the coach configured in the builder.
 *
 * The configuration is re-parsed here **and** validated in the procedure —
 * this action is a caller, not a gate. Every id it carries is checked against
 * the workspace's catalogues server-side (§17); the browser assembled them and
 * is not trusted with which ones are reachable.
 */
export async function addConfiguredModuleAction(
  assessmentId: string,
  name: string,
  moduleKey: string,
  configuration: unknown,
): Promise<{ message?: string; moduleId?: string }> {
  const key = moduleKeySchema.safeParse(moduleKey);
  if (!key.success) return { message: 'Unbekannter Testtyp.' };
  if (name.trim() === '') return { message: 'Bitte einen Namen für den Test eingeben.' };

  const parsed = moduleConfigurationSchema.safeParse(configuration);
  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? 'Dieser Test ist noch nicht konfiguriert.',
    };
  }

  try {
    const created = await api.assessments.addModule({
      assessmentId,
      name: name.trim(),
      moduleKey: key.data,
      configuration: parsed.data,
    });
    revalidatePath(`/assessments/${assessmentId}`);

    return { moduleId: created.id };
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/**
 * Replaces a test's configuration.
 *
 * Refused by the procedure when the change would misdescribe values already
 * recorded — the message names every obstacle, not just the first.
 */
export async function updateModuleConfigurationAction(
  moduleId: string,
  assessmentId: string,
  configuration: unknown,
): Promise<{ message?: string }> {
  const parsed = moduleConfigurationSchema.safeParse(configuration);
  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? 'Dieser Test ist noch nicht konfiguriert.',
    };
  }

  try {
    await api.assessments.updateModuleConfiguration({ moduleId, configuration: parsed.data });
    revalidatePath(`/assessments/${assessmentId}`);

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/** Copies a configured test. No measurement travels with it (§13). */
export async function copyModuleAction(
  moduleId: string,
  assessmentId: string,
  targetAssessmentId?: string,
): Promise<{ message?: string; moduleId?: string }> {
  try {
    const copy = await api.assessments.copyModule({
      moduleId,
      ...(targetAssessmentId ? { targetAssessmentId } : {}),
    });
    revalidatePath(`/assessments/${assessmentId}`);
    if (targetAssessmentId) revalidatePath(`/assessments/${targetAssessmentId}`);

    return { moduleId: copy.id };
  } catch (error) {
    return { message: toMessage(error) };
  }
}

export async function removeModuleAction(
  moduleId: string,
  assessmentId: string,
): Promise<{ message?: string }> {
  try {
    await api.assessments.removeModule({ moduleId });
    revalidatePath(`/assessments/${assessmentId}`);

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/**
 * Copies the configuration of an assessment onto a new one.
 *
 * No measurement is carried across — the new assessment is an independent
 * examination. The procedure enforces that; this only reports where to go next.
 */
export async function copyAssessmentAction(
  assessmentId: string,
): Promise<{ message?: string; assessmentId?: string }> {
  try {
    const copy = await api.assessments.copy({ assessmentId });
    revalidatePath('/athletes');

    return { assessmentId: copy.id };
  } catch (error) {
    return { message: toMessage(error) };
  }
}

function toMessage(error: unknown): string {
  if (error instanceof TRPCError) return error.message;

  console.error('[assessments] unexpected failure', error);

  return 'Something went wrong. Please try again.';
}
