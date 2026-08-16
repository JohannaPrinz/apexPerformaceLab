import { mapExternalValue, nameFingerprint } from '@apex/domain';

import {
  hasField,
  NEUTRAL_FIELDS,
  type NeutralDataset,
  type NeutralExercise,
  type NeutralField,
} from './neutral';

/**
 * Putting the datasets side by side.
 *
 * Nothing here decides anything. Every function answers one question about what
 * the sources say, and the answers are what a person needs in order to curate a
 * catalogue: which movements appear in more than one dataset, where the sources
 * contradict each other, which words none of our vocabularies know, and what is
 * simply missing.
 */

// ── Which movements are the same movement ────────────────────────────────────

export interface MatchedMovement {
  /** The fingerprint the records agree on. */
  readonly fingerprint: string;
  /** A readable name — the longest, which is usually the most specific. */
  readonly name: string;
  readonly records: readonly NeutralExercise[];
  readonly sources: readonly string[];
}

/**
 * Groups records across datasets by name.
 *
 * Uses the same fingerprint the product's duplicate detection uses, so a match
 * here means the same thing it will mean later: case, punctuation, word order
 * and filler words are ignored; equipment words are kept, because a barbell row
 * and a dumbbell row are two movements.
 *
 * A match is **evidence, not identity**. Two datasets calling something "Press"
 * may well mean different things, which is exactly what the conflict report
 * below is for.
 */
export function matchMovements(datasets: readonly NeutralDataset[]): readonly MatchedMovement[] {
  const groups = new Map<string, NeutralExercise[]>();

  for (const dataset of datasets) {
    for (const exercise of dataset.exercises) {
      const fingerprint = nameFingerprint(exercise.name);
      if (fingerprint === '') continue;

      const group = groups.get(fingerprint) ?? [];
      group.push(exercise);
      groups.set(fingerprint, group);
    }
  }

  return [...groups.entries()]
    .map(([fingerprint, records]) => ({
      fingerprint,
      name: [...records].sort((a, b) => b.name.length - a.name.length)[0]?.name ?? fingerprint,
      records,
      sources: [...new Set(records.map((record) => record.source))].sort(),
    }))
    .sort((a, b) => b.sources.length - a.sources.length || a.name.localeCompare(b.name));
}

/** Movements more than one dataset carries — the strongest candidates. */
export function corroborated(matches: readonly MatchedMovement[]): readonly MatchedMovement[] {
  return matches.filter((match) => match.sources.length > 1);
}

/** Movements only one dataset carries — worth a look, not automatically weaker. */
export function uniqueToOneSource(matches: readonly MatchedMovement[]): readonly MatchedMovement[] {
  return matches.filter((match) => match.sources.length === 1);
}

/**
 * Two records in the **same** dataset sharing a fingerprint.
 *
 * A dataset duplicating itself is a fact about that dataset, and it is the kind
 * of thing that quietly doubles a catalogue if nobody looks.
 */
export function duplicatesWithinSource(
  matches: readonly MatchedMovement[],
): readonly { readonly source: string; readonly name: string; readonly count: number }[] {
  const found: { source: string; name: string; count: number }[] = [];

  for (const match of matches) {
    const bySource = new Map<string, number>();
    for (const record of match.records) {
      bySource.set(record.source, (bySource.get(record.source) ?? 0) + 1);
    }
    for (const [source, count] of bySource) {
      if (count > 1) found.push({ source, name: match.name, count });
    }
  }

  return found.sort((a, b) => b.count - a.count);
}

// ── Where the sources contradict each other ──────────────────────────────────

export type ConflictField = 'category' | 'forceType' | 'mechanic' | 'difficulty' | 'equipment';

export interface Conflict {
  readonly name: string;
  readonly field: ConflictField;
  /** What each source claims, by source key. */
  readonly claims: readonly { readonly source: string; readonly value: string }[];
}

/**
 * Records that agree on the movement and disagree on a property.
 *
 * Compared after normalising the *spelling* only — `Body Only` and `body only`
 * are not a conflict — but never after mapping onto our vocabulary. Mapping
 * would hide the disagreement by resolving it, and resolving it is the decision
 * this report exists to inform.
 */
export function findConflicts(matches: readonly MatchedMovement[]): readonly Conflict[] {
  const fields: readonly ConflictField[] = [
    'category',
    'forceType',
    'mechanic',
    'difficulty',
    'equipment',
  ];
  const conflicts: Conflict[] = [];

  for (const match of corroborated(matches)) {
    for (const field of fields) {
      const claims = match.records
        .map((record) => ({
          source: record.source,
          value:
            field === 'equipment'
              ? [...record.equipment].map(normalise).sort().join(' + ')
              : normalise(record[field] ?? ''),
        }))
        .filter((claim) => claim.value !== '');

      const distinct = new Set(claims.map((claim) => claim.value));
      if (distinct.size > 1) conflicts.push({ name: match.name, field, claims });
    }
  }

  return conflicts;
}

function normalise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ── What the sources call things ─────────────────────────────────────────────

export interface VocabularyUsage {
  readonly value: string;
  /** How often, by source. */
  readonly bySource: Readonly<Record<string, number>>;
  readonly total: number;
  /**
   * What our taxonomy makes of it — **per source that uses it**.
   *
   * Asked per source on purpose. The tables are per source, so "wrkout knows
   * `kettlebells`" says nothing about whether the wger table does; a value is
   * only covered when *every* source that uses it can translate it. Asking
   * "does anybody know this word" would have reported full coverage while the
   * candidate builder, which asks per record, still found hundreds of gaps.
   */
  readonly ours: 'mapped' | 'dropped' | 'unmapped';
  readonly mappedTo?: string | undefined;
  /** Sources that use the value and have no entry for it. */
  readonly unmappedFor: readonly string[];
}

/**
 * Every word the sources use for one axis, with what we make of it.
 *
 * This is the table that says whether our vocabulary actually covers the data —
 * an `unmapped` row with a high count is a hole in our taxonomy, and an
 * `unmapped` row appearing twice is probably a typo in a source.
 */
export function vocabularyUsage(
  datasets: readonly NeutralDataset[],
  axis: 'muscle' | 'equipment' | 'category',
): readonly VocabularyUsage[] {
  const counts = new Map<string, Map<string, number>>();

  const record = (source: string, value: string) => {
    const key = value.trim();
    if (key === '') return;
    const bySource = counts.get(key) ?? new Map<string, number>();
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
    counts.set(key, bySource);
  };

  for (const dataset of datasets) {
    for (const exercise of dataset.exercises) {
      if (axis === 'muscle') {
        for (const muscle of [...exercise.primaryMuscles, ...exercise.secondaryMuscles]) {
          record(dataset.source, muscle);
        }
      } else if (axis === 'equipment') {
        for (const item of exercise.equipment) record(dataset.source, item);
      } else if (exercise.category !== undefined) {
        record(dataset.source, exercise.category);
      }
    }
  }

  return [...counts.entries()]
    .map(([value, bySource]) => {
      const perSource = [...bySource.keys()].map((source) => ({
        source,
        outcome: mapExternalValue(source, axis, value),
      }));

      const unmappedFor = perSource
        .filter((entry) => entry.outcome.kind === 'unmapped')
        .map((entry) => entry.source);
      const mapped = perSource.find((entry) => entry.outcome.kind === 'mapped');
      const dropped = perSource.find((entry) => entry.outcome.kind === 'dropped');

      return {
        value,
        bySource: Object.fromEntries(bySource),
        total: [...bySource.values()].reduce((sum, count) => sum + count, 0),
        ours:
          unmappedFor.length > 0
            ? ('unmapped' as const)
            : mapped
              ? ('mapped' as const)
              : dropped
                ? ('dropped' as const)
                : ('unmapped' as const),
        mappedTo: mapped?.outcome.kind === 'mapped' ? mapped.outcome.value : undefined,
        unmappedFor,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** The words no vocabulary of ours knows — the gaps worth deciding on. */
export function unmappedValues(usage: readonly VocabularyUsage[]): readonly VocabularyUsage[] {
  return usage.filter((entry) => entry.ours === 'unmapped');
}

// ── What is missing ──────────────────────────────────────────────────────────

export interface Coverage {
  readonly source: string;
  readonly total: number;
  /** Share of records carrying each field, 0–1. */
  readonly fields: Readonly<Record<NeutralField, number>>;
}

/**
 * How completely each dataset fills each field.
 *
 * The point is not to rank the sources but to see which one has to supply
 * what — the dataset with instructions is not the dataset with variants, and a
 * curated catalogue will take different fields from different places.
 */
export function coverage(datasets: readonly NeutralDataset[]): readonly Coverage[] {
  return datasets.map((dataset) => {
    const total = dataset.exercises.length;
    const fields = Object.fromEntries(
      NEUTRAL_FIELDS.map((field) => [
        field,
        total === 0
          ? 0
          : dataset.exercises.filter((exercise) => hasField(exercise, field)).length / total,
      ]),
    ) as Record<NeutralField, number>;

    return { source: dataset.source, total, fields };
  });
}

// ── Variant relations ────────────────────────────────────────────────────────

export interface VariantComparison {
  readonly source: string;
  /** How many records declare at least one variant relation. */
  readonly withRelations: number;
  /** Distinct pairs the source expresses, by fingerprint. */
  readonly pairs: readonly (readonly [string, string])[];
  readonly note: string;
}

/**
 * What each source says about variants — including the sources that say nothing.
 *
 * Reported per source rather than merged, because the interesting result is the
 * asymmetry: one dataset expresses variants by name, one by a shared group id,
 * and one not at all.
 */
export function compareVariants(datasets: readonly NeutralDataset[]): readonly VariantComparison[] {
  return datasets.map((dataset) => {
    const pairs = new Set<string>();
    let withRelations = 0;

    for (const exercise of dataset.exercises) {
      if (exercise.variantsOf.length === 0) continue;
      withRelations++;

      for (const other of exercise.variantsOf) {
        const a = nameFingerprint(exercise.name);
        const b = nameFingerprint(other);
        if (a === '' || b === '' || a === b) continue;
        pairs.add(a < b ? `${a}|${b}` : `${b}|${a}`);
      }
    }

    return {
      source: dataset.source,
      withRelations,
      pairs: [...pairs].map((pair) => pair.split('|') as [string, string]),
      note:
        withRelations === 0
          ? 'Expresses no variant relations at all.'
          : `Declares relations on ${String(withRelations)} of ${String(dataset.exercises.length)} records.`,
    };
  });
}
