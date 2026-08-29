import { z } from 'zod';

/**
 * What the coach writes into an analysis.
 *
 * ## Why nothing here is generated any more
 *
 * Version 1 stored a *generated* paragraph per test, plus the wording it was
 * generated from, plus a flag saying whether a person had since edited it. All
 * three existed to solve one problem: values arriving after the text was written
 * must not overwrite it.
 *
 * That problem disappears once the facts are **rendered rather than typed**. A
 * table built from the measurements at the moment of reading is always current
 * and has nothing to overwrite. What is left is what only a person can write —
 * the professional reading of those facts, and what they propose doing about it.
 *
 * So: two texts per test, two for the analysis as a whole, and no machine
 * authorship anywhere. A sentence in here was written by the coach, always.
 *
 * ## Why the recommendation is text and not a `Recommendation`
 *
 * §15's `Recommendation` is an object with a lifecycle — proposed, accepted, in
 * progress, done — an assignee and a due date, and it appears in the athlete's
 * portal as a task. It also requires an Insight to derive from.
 *
 * What a coach types at the end of an analysis is none of that. It is a sentence
 * in a document. Storing it as a `Recommendation` would claim a lifecycle nobody
 * asked for and break the rule that a recommendation follows an insight. When
 * real recommendations arrive, they arrive beside this, not instead of it.
 *
 * ## Versioning
 *
 * The payload carries its own version, and version 1 is **upgraded on read**
 * rather than refused: a coach's paragraph is their work, and a shape change
 * must not lose it. A version this code does not know is still refused — half
 * reading an unknown shape is how a record acquires sentences nobody wrote.
 */

export const REPORT_DRAFT_VERSION = 2;

/** One pair of texts: what it means, and what follows from it. */
const draftTextsSchema = z.object({
  /** The professional reading of the facts. Never generated. */
  interpretation: z.string().max(20_000).default(''),
  /** What the coach proposes. Never generated, and never derived from a value. */
  recommendation: z.string().max(20_000).default(''),
});

export const reportDraftSectionSchema = draftTextsSchema.extend({
  /** Which test this section speaks about. */
  moduleId: z.string().min(1),
});

export const reportDraftSchema = z.object({
  version: z.literal(REPORT_DRAFT_VERSION),
  /** The analysis-wide texts. One pair, never per test. */
  overall: draftTextsSchema,
  sections: z.array(reportDraftSectionSchema),
});

export type ReportDraft = z.infer<typeof reportDraftSchema>;
export type ReportDraftSection = z.infer<typeof reportDraftSectionSchema>;

/** Which of the two texts is being addressed. */
export const DRAFT_FIELDS = ['interpretation', 'recommendation'] as const;
export const draftFieldSchema = z.enum(DRAFT_FIELDS);
export type DraftField = z.infer<typeof draftFieldSchema>;

/** Which text is being addressed. */
export type DraftTarget = { kind: 'overall' } | { kind: 'section'; moduleId: string };

/**
 * Version 1, as it was written.
 *
 * Kept only to read what already exists. Its `generated` and `basis` fields are
 * dropped on upgrade — they described a machine authorship that no longer
 * happens, and carrying them forward would preserve a claim about text the coach
 * has since made their own.
 */
const legacyTextSchema = z.object({
  text: z.string().max(20_000).default(''),
  generated: z.boolean().optional(),
  basis: z.string().max(20_000).optional(),
});

const legacyDraftSchema = z.object({
  version: z.literal(1),
  overall: legacyTextSchema,
  sections: z.array(legacyTextSchema.extend({ moduleId: z.string().min(1) })),
});

/**
 * Reads a stored draft, upgrading version 1.
 *
 * A version-1 paragraph becomes the **interpretation**: whatever a coach had
 * edited into it was their reading of the test, which is what that field now
 * means. The recommendation starts empty, because version 1 had nowhere to put
 * one — inventing content for it would be worse than an empty field.
 *
 * `null` where there is no draft or the shape cannot be read.
 */
export function readReportDraft(payload: unknown): ReportDraft | null {
  const current = reportDraftSchema.safeParse(payload);
  if (current.success) return current.data;

  const legacy = legacyDraftSchema.safeParse(payload);
  if (!legacy.success) return null;

  return {
    version: REPORT_DRAFT_VERSION,
    overall: { interpretation: legacy.data.overall.text, recommendation: '' },
    sections: legacy.data.sections.map((section) => ({
      moduleId: section.moduleId,
      interpretation: section.text,
      recommendation: '',
    })),
  };
}

/** A new draft: nothing written yet, because nothing here is written by us. */
export function emptyReportDraft(): ReportDraft {
  return {
    version: REPORT_DRAFT_VERSION,
    overall: { interpretation: '', recommendation: '' },
    sections: [],
  };
}

/** The texts for one test, or empty ones where the coach has written none. */
export function draftSectionOf(draft: ReportDraft, moduleId: string): ReportDraftSection {
  return (
    draft.sections.find((section) => section.moduleId === moduleId) ?? {
      moduleId,
      interpretation: '',
      recommendation: '',
    }
  );
}

/**
 * Stores one text.
 *
 * A section is created on first writing rather than up front: a draft holds the
 * texts that exist, so a test the coach never wrote about leaves no trace, and
 * an empty section can never be mistaken for a considered blank.
 */
export function withDraftText(
  draft: ReportDraft,
  target: DraftTarget,
  field: DraftField,
  text: string,
): ReportDraft {
  if (target.kind === 'overall') {
    return { ...draft, overall: { ...draft.overall, [field]: text } };
  }

  const known = draft.sections.some((section) => section.moduleId === target.moduleId);

  if (!known) {
    return {
      ...draft,
      sections: [
        ...draft.sections,
        { moduleId: target.moduleId, interpretation: '', recommendation: '', [field]: text },
      ],
    };
  }

  return {
    ...draft,
    sections: draft.sections.map((section) =>
      section.moduleId === target.moduleId ? { ...section, [field]: text } : section,
    ),
  };
}

/** Whether the coach has written anything at all. Decides if an analysis is finishable. */
export function hasWrittenText(draft: ReportDraft): boolean {
  const written = (value: string) => value.trim() !== '';

  return (
    written(draft.overall.interpretation) ||
    written(draft.overall.recommendation) ||
    draft.sections.some(
      (section) => written(section.interpretation) || written(section.recommendation),
    )
  );
}
