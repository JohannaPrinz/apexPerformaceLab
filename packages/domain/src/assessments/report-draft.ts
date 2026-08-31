import { z } from 'zod';

import { MAX_STILLS_PER_MODULE } from './report-media';

/**
 * What the coach writes into an analysis, and which pictures they chose.
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
 * ## Why the chosen stills live here and not with the video analysis
 *
 * A movement analysis may produce a dozen stills; an analysis uses two. Which
 * two is an editorial decision about *this document*, exactly like the sentence
 * beside them — so it belongs to the draft, and a still that was never chosen
 * leaves no trace in the published analysis and is deleted with the rest.
 *
 * Stored as storage keys rather than as an object: the picture itself is not the
 * draft's to describe. At publication the chosen keys are copied into the frozen
 * content as `ReportMedia`, captions and all, and only then does a still acquire
 * a name that outlives the analysis screen.
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
 * The payload carries its own version, and older versions are **upgraded on
 * read** rather than refused: a coach's paragraph is their work, and a shape
 * change must not lose it. A version this code does not know is still refused —
 * half reading an unknown shape is how a record acquires sentences nobody wrote.
 */

export const REPORT_DRAFT_VERSION = 3;

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
  /**
   * The stills the coach picked for this test, as storage keys.
   *
   * Empty is the normal state: most tests have no video behind them, and a test
   * that does still shows no picture until somebody chooses one.
   */
  stills: z.array(z.string().min(1).max(300)).max(MAX_STILLS_PER_MODULE).default([]),
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

const version1Schema = z.object({
  version: z.literal(1),
  overall: legacyTextSchema,
  sections: z.array(legacyTextSchema.extend({ moduleId: z.string().min(1) })),
});

/** Version 2: the two texts, before stills could be chosen. */
const version2Schema = z.object({
  version: z.literal(2),
  overall: draftTextsSchema,
  sections: z.array(draftTextsSchema.extend({ moduleId: z.string().min(1) })),
});

/**
 * Reads a stored draft, upgrading every version this code has ever written.
 *
 * A version-1 paragraph becomes the **interpretation**: whatever a coach had
 * edited into it was their reading of the test, which is what that field now
 * means. The recommendation starts empty, because version 1 had nowhere to put
 * one — inventing content for it would be worse than an empty field.
 *
 * A version-2 draft gains an empty list of stills, which is the truth: nobody
 * could choose one yet.
 *
 * `null` where there is no draft or the shape cannot be read.
 */
export function readReportDraft(payload: unknown): ReportDraft | null {
  const current = reportDraftSchema.safeParse(payload);
  if (current.success) return current.data;

  const two = version2Schema.safeParse(payload);
  if (two.success) {
    return {
      version: REPORT_DRAFT_VERSION,
      overall: two.data.overall,
      sections: two.data.sections.map((section) => ({ ...section, stills: [] })),
    };
  }

  const one = version1Schema.safeParse(payload);
  if (!one.success) return null;

  return {
    version: REPORT_DRAFT_VERSION,
    overall: { interpretation: one.data.overall.text, recommendation: '' },
    sections: one.data.sections.map((section) => ({
      moduleId: section.moduleId,
      interpretation: section.text,
      recommendation: '',
      stills: [],
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
      stills: [],
    }
  );
}

/** A section as it looks before anybody has written into it. */
function blankSection(moduleId: string): ReportDraftSection {
  return { moduleId, interpretation: '', recommendation: '', stills: [] };
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
      sections: [...draft.sections, { ...blankSection(target.moduleId), [field]: text }],
    };
  }

  return {
    ...draft,
    sections: draft.sections.map((section) =>
      section.moduleId === target.moduleId ? { ...section, [field]: text } : section,
    ),
  };
}

/**
 * Adds or removes one still from a test's section.
 *
 * Appended rather than inserted, for the same reason the trend cards are: the
 * order is the coach's, and a picture arriving in the middle of it would
 * rearrange a document they had settled. Adding beyond the limit leaves the
 * draft alone rather than throwing — a full list is a state the interface can
 * explain, not an error it has to handle.
 */
export function withDraftStill(
  draft: ReportDraft,
  moduleId: string,
  key: string,
  chosen: boolean,
): ReportDraft {
  const known = draft.sections.some((section) => section.moduleId === moduleId);

  if (!known) {
    if (!chosen) return draft;

    return {
      ...draft,
      sections: [...draft.sections, { ...blankSection(moduleId), stills: [key] }],
    };
  }

  return {
    ...draft,
    sections: draft.sections.map((section) => {
      if (section.moduleId !== moduleId) return section;

      if (!chosen) return { ...section, stills: section.stills.filter((entry) => entry !== key) };
      if (section.stills.includes(key) || section.stills.length >= MAX_STILLS_PER_MODULE) {
        return section;
      }

      return { ...section, stills: [...section.stills, key] };
    }),
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

/** Every still the draft points at, across all tests. What publishing copies. */
export function chosenStills(draft: ReportDraft): readonly { moduleId: string; key: string }[] {
  return draft.sections.flatMap((section) =>
    section.stills.map((key) => ({ moduleId: section.moduleId, key })),
  );
}
