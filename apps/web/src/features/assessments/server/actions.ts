'use server';

import { revalidatePath } from 'next/cache';

import { TRPCError } from '@trpc/server';

import { moduleConfigurationSchema, moduleKeySchema } from '@apex/domain';
import type { AssessmentStatus } from '@apex/domain';

import { api } from '@/trpc/server';

import { createAssessmentSchema } from '../schemas';

import type { CopyTarget } from '../components/copy-module-button';
import type {
  OwnTemplateOption,
  SelectableExercise,
  SelectableMeasurementType,
} from '../components/create-test-dialog';

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

/**
 * Changes what a coach wrote on an examination.
 *
 * The empty string means "clear it" for the description and is passed on as
 * such; the procedure's schema turns it into null. The question is never
 * cleared — it is mandatory, and the dialog refuses an empty one before this is
 * reached.
 */
export async function updateAssessmentAction(
  assessmentId: string,
  input: {
    question: string;
    description: string;
    type: 'INITIAL' | 'RE_ASSESSMENT' | 'FOLLOW_UP';
    performedAt: string;
  },
): Promise<{ message?: string }> {
  try {
    await api.assessments.update({
      assessmentId,
      question: input.question,
      description: input.description,
      type: input.type,
      performedAt: input.performedAt,
    });
    revalidatePath(`/assessments/${assessmentId}`);
    revalidatePath('/athletes', 'layout');

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/** Renames a test, or records what it is for. Never touches its protocol. */
export async function updateModuleAction(
  moduleId: string,
  assessmentId: string,
  input: { name: string; description: string },
): Promise<{ message?: string }> {
  try {
    await api.assessments.updateModule({
      moduleId,
      name: input.name,
      description: input.description,
    });
    revalidatePath(`/assessments/${assessmentId}`, 'layout');

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/**
 * Puts a test away, or brings it back.
 *
 * `layout` revalidation, because the test appears both on the assessment and on
 * its own overview, and both must agree about whether it is archived.
 */
export async function setModuleArchivedAction(
  moduleId: string,
  assessmentId: string,
  archived: boolean,
): Promise<{ message?: string }> {
  try {
    await api.assessments.setModuleArchived({ moduleId, archived });
    revalidatePath(`/assessments/${assessmentId}`, 'layout');

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

/**
 * Moves an examination through its lifecycle.
 *
 * A thin caller: the transition rule and the "no test may still be open" check
 * both live in the procedure, where they cannot be skipped.
 */
export async function setAssessmentStatusAction(
  assessmentId: string,
  status: AssessmentStatus,
): Promise<{ message?: string }> {
  try {
    await api.assessments.setStatus({ assessmentId, status });
    revalidatePath(`/assessments/${assessmentId}`);

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/**
 * Saves the configuration on screen as a template of this workspace.
 *
 * Only from an adjusted one: saving a shipped template unchanged would put a
 * second copy of it in the picker under a different name, and the coach would
 * have two entries meaning the same thing.
 */
export async function saveModuleTemplateAction(
  assessmentId: string,
  name: string,
  moduleKey: string,
  configuration: unknown,
): Promise<{ message?: string; templateId?: string }> {
  const key = moduleKeySchema.safeParse(moduleKey);
  if (!key.success) return { message: 'Unbekannter Testtyp.' };

  const parsed = moduleConfigurationSchema.safeParse(configuration);
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? 'Diese Vorlage ist unvollständig.' };
  }

  try {
    const saved = await api.assessments.saveTemplate({
      name,
      moduleKey: key.data,
      configuration: parsed.data,
    });
    revalidatePath(`/assessments/${assessmentId}`);

    return { templateId: saved.id };
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/** Renames one. The tests made from it are untouched — they carry their own copy. */
export async function renameModuleTemplateAction(
  assessmentId: string,
  templateId: string,
  name: string,
): Promise<{ message?: string }> {
  try {
    await api.assessments.renameTemplate({ templateId, name });
    revalidatePath(`/assessments/${assessmentId}`);

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/** Deletes one for good. Nothing points at it; see `deleteOwnTemplate`. */
export async function deleteModuleTemplateAction(
  assessmentId: string,
  templateId: string,
): Promise<{ message?: string }> {
  try {
    await api.assessments.deleteTemplate({ templateId });
    revalidatePath(`/assessments/${assessmentId}`);

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/**
 * What the "add a test" dialog needs, fetched when it opens (§26).
 *
 * ## Why not with the page
 *
 * These three lists cost the assessment screen a fifth of its load time before
 * anybody had clicked anything: the exercise catalogue alone is 200 rows and
 * 212 kB, and it exists for a dialog that is closed. The measurement put the
 * whole assessment render at 32 queries; these are four of them, and the
 * heaviest single one.
 *
 * ## Why one action for three lists
 *
 * They are opened together and useless apart — a template names quantities by
 * key and exercises by name, so a dialog holding one without the others cannot
 * apply anything. One round trip rather than three.
 *
 * The doors are unchanged: each list comes from the procedure that already
 * owned it, so the workspace scope and the permission it requires are exactly
 * what they were when the page asked.
 */
export async function testCatalogueAction(): Promise<
  | {
      readonly ok: true;
      readonly exercises: readonly SelectableExercise[];
      readonly measurementTypes: readonly SelectableMeasurementType[];
      readonly ownTemplates: readonly OwnTemplateOption[];
    }
  | { readonly ok: false; readonly message: string }
> {
  try {
    const [exercises, measurementTypes, ownTemplates] = await Promise.all([
      api.exercises.list({ includeArchived: false, limit: 200, offset: 0 }),
      api.assessments.measurementTypes(),
      api.assessments.ownTemplates(),
    ]);

    return {
      ok: true,
      // The same projection the page did, kept here so the dialog receives what
      // it always received.
      exercises: exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        category: exercise.category,
        scope: exercise.scope,
      })),
      measurementTypes,
      ownTemplates,
    };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

/**
 * The athlete's other examinations, for the "copy into" menu.
 *
 * Read when the menu opens rather than with the page: a coach opens an
 * assessment to look at it, and this list only answers "where else should this
 * test go".
 *
 * `athleteId` names *which* athlete, it does not grant anything — the procedure
 * is workspace-scoped, so an id from another workspace returns nothing. That is
 * the same arrangement the page had.
 */
export async function copyTargetsAction(
  athleteId: string,
  assessmentId: string,
): Promise<
  | { readonly ok: true; readonly targets: readonly CopyTarget[] }
  | { readonly ok: false; readonly message: string }
> {
  try {
    const siblings = await api.assessments.listForAthlete({ athleteId });

    return {
      ok: true,
      targets: siblings
        .filter((entry) => entry.id !== assessmentId)
        .map((entry) => ({ id: entry.id, question: entry.question })),
    };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}
