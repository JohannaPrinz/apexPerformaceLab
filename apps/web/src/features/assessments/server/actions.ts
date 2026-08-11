'use server';

import { revalidatePath } from 'next/cache';

import { TRPCError } from '@trpc/server';

import { moduleKeySchema } from '@apex/domain';

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
  moduleKey: string,
  templateKey: string | undefined,
): Promise<{ message?: string }> {
  const key = moduleKeySchema.safeParse(moduleKey);
  if (!key.success) return { message: 'Unknown module.' };

  try {
    await api.assessments.addModule({
      assessmentId,
      moduleKey: key.data,
      ...(templateKey ? { templateKey: templateKey as never } : { configuration: undefined }),
    });
    revalidatePath(`/assessments/${assessmentId}`);

    return {};
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
