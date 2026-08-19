import {
  findMeasurementTemplate,
  moduleConfigurationSchema,
  type ContextDimension,
  type MeasurementRole,
  type MeasurementTemplate,
  type ModuleConfiguration,
  type ModuleKey,
} from '@apex/domain';

import { MEASUREMENT_ROLE_LABELS_DE, MODULE_LABELS_DE } from '../labels';

/**
 * The test a coach is assembling, before it becomes a configuration.
 *
 * Kept as a plain value with plain functions — **no React, no database** — so
 * every rule below is testable on its own. The builder screen renders this and
 * decides nothing.
 *
 * ## Why a draft and not the configuration itself
 *
 * `ModuleConfiguration` is the *finished* contract: at least one measurement,
 * a valid pass count, dimension keys that are stable identifiers. A half-filled
 * form satisfies none of that and must still be representable — a coach who has
 * picked a module but no quantities yet has a draft, not an invalid
 * configuration. `toConfiguration` is the one place the two meet, and it goes
 * through the real schema rather than a second set of rules.
 *
 * ## No parallel configuration structure
 *
 * The draft holds exactly the fields `moduleConfigurationSchema` declares and
 * nothing else (§16). It is the same shape with the constraints relaxed, not a
 * second model that would have to be kept in step.
 */

export interface BuilderDraft {
  readonly moduleKey: ModuleKey;
  /** Which template seeded it, for the summary. Never stored on the module. */
  readonly templateKey: string | null;
  readonly measurementTypes: readonly { measurementTypeId: string; role: MeasurementRole }[];
  readonly exerciseIds: readonly string[];
  readonly passes: number;
  readonly recordsSide: boolean;
  readonly dimensions: readonly ContextDimension[];
  readonly notes: string;
}

export function emptyDraft(moduleKey: ModuleKey): BuilderDraft {
  return {
    moduleKey,
    templateKey: null,
    measurementTypes: [],
    exerciseIds: [],
    passes: 1,
    recordsSide: false,
    dimensions: [],
    notes: '',
  };
}

/**
 * Seeds a draft from a template.
 *
 * The template names measurement types by **key**; the draft holds **ids**, so
 * the caller supplies the catalogue. A key the workspace has no type for is
 * dropped rather than guessed — the coach sees a shorter list and can add what
 * they meant, which is better than a configuration referring to nothing.
 *
 * **The result is a copy.** Nothing links back to the template afterwards, and
 * `templateKey` is carried only so the summary can say where the draft started;
 * it is not part of the configuration and never reaches the database (§11).
 */
export function draftFromTemplate(
  template: MeasurementTemplate,
  idForTypeKey: (key: string) => string | undefined,
): BuilderDraft {
  return {
    moduleKey: template.moduleKey,
    templateKey: template.key,
    measurementTypes: template.measurements.flatMap((entry) => {
      const measurementTypeId = idForTypeKey(entry.key);

      return measurementTypeId ? [{ measurementTypeId, role: entry.role }] : [];
    }),
    exerciseIds: [],
    passes: template.passes,
    recordsSide: template.recordsSide,
    dimensions: template.dimensions.map((dimension) => ({ ...dimension })),
    notes: '',
  };
}

/** Seeds a draft from a template key, or an empty one when the key is unknown. */
export function draftFromTemplateKey(
  templateKey: string,
  moduleKey: ModuleKey,
  idForTypeKey: (key: string) => string | undefined,
): BuilderDraft {
  const template = findMeasurementTemplate(templateKey);

  return template ? draftFromTemplate(template, idForTypeKey) : emptyDraft(moduleKey);
}

/** Reopens a stored configuration for editing. */
export function draftFromConfiguration(
  moduleKey: ModuleKey,
  configuration: ModuleConfiguration,
): BuilderDraft {
  return {
    moduleKey,
    // A stored configuration has no template: the link was never kept.
    templateKey: null,
    measurementTypes: configuration.measurementTypes.map((entry) => ({ ...entry })),
    exerciseIds: [...configuration.exerciseIds],
    passes: configuration.passes,
    recordsSide: configuration.recordsSide,
    dimensions: configuration.dimensions.map((dimension) => ({ ...dimension })),
    notes: configuration.notes ?? '',
  };
}

// ── Editing ──────────────────────────────────────────────────────────────────
// Every operation returns a new draft. The screen holds one value in state and
// replaces it, which is why none of this needs to know about React.

/** Adds a quantity, or leaves the draft alone if it is already there. */
export function withMeasurementType(
  draft: BuilderDraft,
  measurementTypeId: string,
  role: MeasurementRole = 'required',
): BuilderDraft {
  if (draft.measurementTypes.some((entry) => entry.measurementTypeId === measurementTypeId)) {
    return draft;
  }

  return {
    ...draft,
    measurementTypes: [...draft.measurementTypes, { measurementTypeId, role }],
  };
}

export function withoutMeasurementType(
  draft: BuilderDraft,
  measurementTypeId: string,
): BuilderDraft {
  return {
    ...draft,
    measurementTypes: draft.measurementTypes.filter(
      (entry) => entry.measurementTypeId !== measurementTypeId,
    ),
  };
}

export function withRole(
  draft: BuilderDraft,
  measurementTypeId: string,
  role: MeasurementRole,
): BuilderDraft {
  return {
    ...draft,
    measurementTypes: draft.measurementTypes.map((entry) =>
      entry.measurementTypeId === measurementTypeId ? { ...entry, role } : entry,
    ),
  };
}

/** Moves a quantity in the list. Order is configuration — the entry grid follows it. */
export function withMeasurementTypeMoved(
  draft: BuilderDraft,
  measurementTypeId: string,
  direction: -1 | 1,
): BuilderDraft {
  const index = draft.measurementTypes.findIndex(
    (entry) => entry.measurementTypeId === measurementTypeId,
  );
  const target = index + direction;

  if (index === -1 || target < 0 || target >= draft.measurementTypes.length) return draft;

  const measurementTypes = [...draft.measurementTypes];
  const [moved] = measurementTypes.splice(index, 1);
  if (moved) measurementTypes.splice(target, 0, moved);

  return { ...draft, measurementTypes };
}

export function withExercise(draft: BuilderDraft, exerciseId: string): BuilderDraft {
  return draft.exerciseIds.includes(exerciseId)
    ? draft
    : { ...draft, exerciseIds: [...draft.exerciseIds, exerciseId] };
}

export function withoutExercise(draft: BuilderDraft, exerciseId: string): BuilderDraft {
  return { ...draft, exerciseIds: draft.exerciseIds.filter((id) => id !== exerciseId) };
}

/**
 * Sets the number of passes.
 *
 * Clamped to the range the configuration schema permits, so the field cannot
 * put the draft into a state that only fails on save. One is not a special
 * value here — a single-pass test simply records `passes: 1`, and it is the
 * *measurement* that then carries `passIndex: null` rather than a constant 1.
 */
export function withPasses(draft: BuilderDraft, passes: number): BuilderDraft {
  const whole = Number.isFinite(passes) ? Math.round(passes) : 1;

  return { ...draft, passes: Math.min(Math.max(whole, 1), 50) };
}

export function withRecordsSide(draft: BuilderDraft, recordsSide: boolean): BuilderDraft {
  return { ...draft, recordsSide };
}

export function withDimension(draft: BuilderDraft, dimension: ContextDimension): BuilderDraft {
  return draft.dimensions.some((existing) => existing.key === dimension.key)
    ? draft
    : { ...draft, dimensions: [...draft.dimensions, dimension] };
}

export function withoutDimension(draft: BuilderDraft, key: string): BuilderDraft {
  return { ...draft, dimensions: draft.dimensions.filter((dimension) => dimension.key !== key) };
}

/**
 * Sets the values a dimension permits.
 *
 * An empty list means an **open** dimension: the coach names the sites as they
 * go, and the entry screen offers a free field instead of pretending to know how
 * many are coming. Declaring values is always the coach's own decision — the
 * shipped templates declare none, because naming joints or muscle sites is a
 * professional call this system does not make for them.
 */
export function withDimensionValues(
  draft: BuilderDraft,
  key: string,
  values: readonly string[],
): BuilderDraft {
  const cleaned = values.map((value) => value.trim()).filter((value) => value !== '');

  return {
    ...draft,
    dimensions: draft.dimensions.map((dimension) =>
      dimension.key === key
        ? {
            key: dimension.key,
            label: dimension.label,
            ...(cleaned.length > 0 ? { values: cleaned } : {}),
          }
        : dimension,
    ),
  };
}

export function withNotes(draft: BuilderDraft, notes: string): BuilderDraft {
  return { ...draft, notes };
}

/** Turns a display name into a dimension key, the way the schema requires one. */
export function toDimensionKey(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

// ── Validation and output ────────────────────────────────────────────────────

/**
 * The draft as a configuration, or `null` while it is not one yet.
 *
 * Goes through `moduleConfigurationSchema` — the same contract that validates
 * `AssessmentModule.payload` and the same one the procedure re-checks. There is
 * deliberately no second set of rules here to drift from it.
 */
export function toConfiguration(draft: BuilderDraft): ModuleConfiguration | null {
  const parsed = moduleConfigurationSchema.safeParse({
    measurementTypes: draft.measurementTypes,
    exerciseIds: draft.exerciseIds,
    passes: draft.passes,
    recordsSide: draft.recordsSide,
    dimensions: draft.dimensions,
    ...(draft.notes.trim() === '' ? {} : { notes: draft.notes.trim() }),
  });

  return parsed.success ? parsed.data : null;
}

export type BuilderStep = 'test' | 'measurements' | 'protocol' | 'summary';

export const BUILDER_STEPS: readonly BuilderStep[] = [
  'test',
  'measurements',
  'protocol',
  'summary',
];

export const BUILDER_STEP_LABELS: Readonly<Record<BuilderStep, string>> = {
  test: 'Test',
  measurements: 'Messgrößen',
  protocol: 'Protokoll',
  summary: 'Zusammenfassung',
};

/**
 * What stops the coach moving on from a step.
 *
 * Returned as sentences rather than a boolean: a disabled button that does not
 * say why is a puzzle, and the reason is always knowable here.
 */
export function stepIssues(draft: BuilderDraft, step: BuilderStep): readonly string[] {
  const issues: string[] = [];

  if (step === 'measurements' && draft.measurementTypes.length === 0) {
    issues.push('Choose at least one measurement — a test without one records nothing.');
  }

  if (step === 'protocol') {
    for (const dimension of draft.dimensions) {
      if (dimension.label.trim() === '') issues.push('Give every dimension a name.');
    }
  }

  if (step === 'summary' && toConfiguration(draft) === null) {
    issues.push('This test is not complete yet.');
  }

  return issues;
}

export function canLeaveStep(draft: BuilderDraft, step: BuilderStep): boolean {
  return stepIssues(draft, step).length === 0;
}

// ── The summary ──────────────────────────────────────────────────────────────

export interface SummaryLine {
  readonly label: string;
  readonly value: string;
  /** Per-measurement rows, so the screen can render the roles as their own marks. */
  readonly entries?: readonly { readonly name: string; readonly role: MeasurementRole }[];
}

/**
 * What the coach reads before saving.
 *
 * Names, never ids — a summary that showed `mt_7f3a` would be worse than none.
 * The caller supplies the lookups, because the catalogue belongs to the screen
 * and this module stays free of data access.
 */
export function summarise(
  draft: BuilderDraft,
  names: {
    measurementType: (id: string) => string;
    exercise: (id: string) => string;
  },
): readonly SummaryLine[] {
  const lines: SummaryLine[] = [
    { label: 'Test', value: MODULE_LABELS_DE[draft.moduleKey] },
    {
      label: 'Messgrößen',
      value:
        draft.measurementTypes.length === 0
          ? 'Keine ausgewählt'
          : `${String(draft.measurementTypes.length)} ausgewählt`,
      entries: draft.measurementTypes.map((entry) => ({
        name: names.measurementType(entry.measurementTypeId),
        role: entry.role,
      })),
    },
    {
      label: 'Stufen',
      // "Einfache Erfassung" rather than "1": a single-pass test is not a
      // stepped test with one stage, and the measurement records
      // `passIndex: null` to say so.
      value: draft.passes > 1 ? String(draft.passes) : 'Einfache Erfassung',
    },
    { label: 'Seiten', value: draft.recordsSide ? 'Links und rechts' : 'Nein' },
    {
      label: 'Merkmale',
      value:
        draft.dimensions.length === 0
          ? 'Keine'
          : draft.dimensions
              .map((dimension) =>
                dimension.values && dimension.values.length > 0
                  ? `${dimension.label} (${dimension.values.join(', ')})`
                  : `${dimension.label} (frei)`,
              )
              .join(' · '),
    },
    {
      label: 'Übungen',
      value:
        draft.exerciseIds.length === 0
          ? 'Keine'
          : draft.exerciseIds.map((id) => names.exercise(id)).join(' · '),
    },
  ];

  if (draft.notes.trim() !== '') lines.push({ label: 'Protocol', value: draft.notes.trim() });

  return lines;
}

/** How many measurements a fully recorded test will hold — shown in the summary. */
export function expectedCount(draft: BuilderDraft): number {
  const configuration = toConfiguration(draft);
  if (!configuration) return 0;

  const sides = configuration.recordsSide ? 2 : 1;
  const exercises = Math.max(configuration.exerciseIds.length, 1);
  const dimensions = configuration.dimensions.reduce(
    (total, dimension) => total * Math.max(dimension.values?.length ?? 1, 1),
    1,
  );
  const counted = configuration.measurementTypes.filter((entry) => entry.role !== 'optional');

  return counted.length * configuration.passes * sides * exercises * dimensions;
}

/** The wording the interface uses for each role. Never the enum name (§9). */
export const ROLE_EXPLANATIONS: Readonly<Record<MeasurementRole, string>> = {
  required: 'Nötig, damit der Test als vollständig erfasst gilt.',
  recommended: 'Für diesen Test sinnvoll, aber nicht zwingend.',
  optional: 'Kann zusätzlich erfasst werden, wenn es nützlich ist.',
} as const;

export { MEASUREMENT_ROLE_LABELS_DE };
