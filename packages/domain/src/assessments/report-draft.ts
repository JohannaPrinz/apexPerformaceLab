import { z } from 'zod';

import type { SummaryModule, SummarySection } from './summary';

/**
 * The working text of an analysis, before it is a document.
 *
 * ## Why the draft is not the snapshot
 *
 * `Report.content` is the frozen record taken at publication (§16) — written
 * once and immutable after. This is the opposite: a thing the coach types into
 * for as long as the analysis is open. Keeping them in one column would mean
 * either a snapshot that changes or a draft that cannot, and both are worse
 * than a second column.
 *
 * ## What "generated" means, and when it stops being true
 *
 * Every section starts as text this system wrote from the recorded values, and
 * says so. The moment the coach changes it, it is theirs: the marking goes,
 * because a sentence a person wrote must never carry a label saying a machine
 * produced it.
 *
 * ## Why the basis is kept as text
 *
 * Each section remembers the generated wording it was created from. Comparing
 * that with what the same facts produce today is the whole change detection:
 * if the numbers moved, the freshly generated sentence differs, and the screen
 * can say so **without touching what the coach wrote**. A hash would do the
 * same job while being unreadable in the record; the wording is both the
 * fingerprint and the thing a coach can be shown.
 *
 * Nothing here regenerates by itself. Overwriting an edited text because a value
 * arrived late is the one behaviour this design exists to rule out.
 */

export const REPORT_DRAFT_VERSION = 1;

const draftTextSchema = z.object({
  /** What is shown and edited. */
  text: z.string().max(20_000),
  /** False once a person has changed it. */
  generated: z.boolean(),
  /**
   * The generated wording this text started from.
   *
   * Kept even after the coach edits, because it is what "the basis has changed"
   * is measured against.
   */
  basis: z.string().max(20_000),
});

export const reportDraftSectionSchema = draftTextSchema.extend({
  /** Which test this section describes. */
  moduleId: z.string().min(1),
});

export const reportDraftSchema = z.object({
  version: z.literal(REPORT_DRAFT_VERSION),
  /** The assessment-wide text. One per analysis, never per test. */
  overall: draftTextSchema,
  sections: z.array(reportDraftSectionSchema),
});

export type ReportDraft = z.infer<typeof reportDraftSchema>;
export type ReportDraftSection = z.infer<typeof reportDraftSectionSchema>;

/** Which text is being addressed. */
export type DraftTarget = { kind: 'overall' } | { kind: 'section'; moduleId: string };

/** The facts one section was generated from. */
export interface GeneratedSection {
  readonly moduleId: string;
  readonly text: string;
}

/**
 * Reads a stored draft, or `null` where there is none or it cannot be read.
 *
 * A payload written by a future shape is refused rather than half-understood —
 * the same reasoning as `readModuleConfiguration`.
 */
export function readReportDraft(payload: unknown): ReportDraft | null {
  const parsed = reportDraftSchema.safeParse(payload);

  return parsed.success ? parsed.data : null;
}

/** A fresh draft: everything generated, nothing edited. */
export function draftFromFacts(
  overall: string,
  sections: readonly GeneratedSection[],
): ReportDraft {
  return {
    version: REPORT_DRAFT_VERSION,
    overall: { text: overall, generated: true, basis: overall },
    sections: sections.map((section) => ({
      moduleId: section.moduleId,
      text: section.text,
      generated: true,
      basis: section.text,
    })),
  };
}

const sameTarget = (target: DraftTarget, moduleId: string): boolean =>
  target.kind === 'section' && target.moduleId === moduleId;

/**
 * The coach's own wording.
 *
 * The basis is deliberately **not** moved: it records what was generated, and
 * that is what a later change of the underlying values is compared against.
 * Moving it here would silence the very hint the coach needs.
 */
export function withDraftText(draft: ReportDraft, target: DraftTarget, text: string): ReportDraft {
  if (target.kind === 'overall') {
    return {
      ...draft,
      overall: { ...draft.overall, text, generated: text === draft.overall.basis },
    };
  }

  return {
    ...draft,
    sections: draft.sections.map((section) =>
      sameTarget(target, section.moduleId)
        ? { ...section, text, generated: text === section.basis }
        : section,
    ),
  };
}

/**
 * Regenerates **one** text, on purpose.
 *
 * The only path that overwrites something a coach may have written, and it
 * exists because they asked for it. Everything else about the draft is left
 * exactly as it was — regenerating one test's paragraph must not touch another.
 */
export function withRegeneratedText(
  draft: ReportDraft,
  target: DraftTarget,
  text: string,
): ReportDraft {
  if (target.kind === 'overall') {
    return { ...draft, overall: { text, generated: true, basis: text } };
  }

  const known = draft.sections.some((section) => sameTarget(target, section.moduleId));

  // A test included after the draft was made has no section yet; regenerating
  // is how it gets one.
  if (!known) {
    return {
      ...draft,
      sections: [
        ...draft.sections,
        { moduleId: target.moduleId, text, generated: true, basis: text },
      ],
    };
  }

  return {
    ...draft,
    sections: draft.sections.map((section) =>
      sameTarget(target, section.moduleId)
        ? { ...section, text, generated: true, basis: text }
        : section,
    ),
  };
}

/** What has moved under a draft since it was written. */
export interface DraftBasisChange {
  /** Sections whose facts no longer produce the wording they were built from. */
  readonly changedModuleIds: readonly string[];
  /** Tests now included that the draft has no section for. */
  readonly addedModuleIds: readonly string[];
  /** Sections whose test is no longer included. */
  readonly removedModuleIds: readonly string[];
}

/**
 * Compares a draft with what the facts say today.
 *
 * Reports, never rewrites. The screen turns this into a sentence; nothing in
 * the draft is touched by asking.
 */
export function draftBasisChange(
  draft: ReportDraft,
  fresh: readonly GeneratedSection[],
): DraftBasisChange {
  const freshById = new Map(fresh.map((section) => [section.moduleId, section.text]));
  const known = new Set(draft.sections.map((section) => section.moduleId));

  return {
    changedModuleIds: draft.sections
      .filter((section) => {
        const now = freshById.get(section.moduleId);

        return now !== undefined && now !== section.basis;
      })
      .map((section) => section.moduleId),
    addedModuleIds: fresh
      .filter((section) => !known.has(section.moduleId))
      .map((section) => section.moduleId),
    removedModuleIds: draft.sections
      .filter((section) => !freshById.has(section.moduleId))
      .map((section) => section.moduleId),
  };
}

/**
 * The assessment-wide opening, as fact.
 *
 * Counts and names, in the same register as the per-test sentences: how many
 * tests the analysis draws on, which kinds, and how much of what they asked for
 * was recorded. No verdict, for the same reason as everywhere else — the model
 * holds no reference range and no direction for any quantity.
 */
export function summariseAssessmentOverall(modules: readonly SummaryModule[]): string {
  if (modules.length === 0) {
    return 'Diese Auswertung zieht noch keinen Test heran.';
  }

  const types = [...new Set(modules.map((module) => module.typeLabel))];
  const recorded = modules.reduce((total, module) => total + module.recorded, 0);
  const expected = modules.reduce((total, module) => total + module.expected, 0);

  const count =
    modules.length === 1 ? 'Ein Test einbezogen' : `${String(modules.length)} Tests einbezogen`;

  return (
    `${count}: ${types.join(', ')}. ` +
    `Insgesamt ${String(recorded)} von ${String(expected)} Werten erfasst.`
  );
}

/** One section's generated wording, from the sentences the summary produced. */
export function generatedTextOf(section: SummarySection): string {
  return section.sentences.join(' ');
}
