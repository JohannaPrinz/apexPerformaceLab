import { mapExternalList, mapExternalValue } from '@apex/domain';

import { corroborated, matchMovements } from './compare';

import type { MatchedMovement } from './compare';
import type { NeutralDataset, NeutralExercise } from './neutral';

/**
 * The candidate pool.
 *
 * One row per movement the sources describe, gathering what each of them says
 * and how far our vocabulary already reaches. **It is not a catalogue** — no
 * German name, no decision about which claim is right, nothing written
 * anywhere. It is the working material a person curates from.
 *
 * ## Why nothing is resolved here
 *
 * Where two sources disagree, both claims are kept side by side. Picking one
 * automatically would mean the catalogue's classifications were decided by
 * whichever dataset happened to be listed first — and the whole reason to read
 * four sources is that no one of them is authoritative.
 */

export interface Candidate {
  /** The name fingerprint the records agree on — a stable handle, not an id. */
  readonly fingerprint: string;
  /** The most specific name found. A German name is chosen later, by a person. */
  readonly suggestedCanonicalName: string;
  /** Every source name, so the wording can be compared. */
  readonly names: readonly { readonly source: string; readonly name: string }[];
  readonly sources: readonly string[];
  /** How many datasets carry it. Corroboration, not correctness. */
  readonly corroboration: number;

  /** Merged and translated into our vocabulary, where that is possible. */
  readonly primaryMuscles: readonly string[];
  readonly secondaryMuscles: readonly string[];
  readonly equipment: readonly string[];
  /** Left undefined when the sources disagree — see `conflicts`. */
  readonly category?: string | undefined;
  readonly forceType?: string | undefined;
  readonly mechanic?: string | undefined;
  readonly difficulty?: string | undefined;

  /** Source values our vocabulary has no entry for. */
  readonly unmapped: readonly string[];
  /** Fields where the sources contradict each other, with both claims. */
  readonly conflicts: readonly { readonly field: string; readonly claims: readonly string[] }[];
  /** Variant fingerprints any source declares. */
  readonly variantsOf: readonly string[];

  /** Provenance, one entry per contributing record. */
  readonly provenance: readonly {
    readonly source: string;
    readonly sourceId: string;
    readonly license: string;
  }[];

  /** What a curator still has to supply before this could be imported. */
  readonly missing: readonly string[];
}

/**
 * Builds the pool from the neutral datasets.
 *
 * Values are translated through our mapping tables so a curator sees how much
 * is already covered — but a value that maps to nothing is **listed**, not
 * discarded, and a field the sources disagree on is left unset with both claims
 * recorded.
 */
export function buildCandidates(datasets: readonly NeutralDataset[]): readonly Candidate[] {
  return matchMovements(datasets).map((match) => toCandidate(match));
}

function toCandidate(match: MatchedMovement): Candidate {
  const unmapped = new Set<string>();

  const mergeList = (
    pick: (record: NeutralExercise) => readonly string[],
    axis: 'muscle' | 'equipment',
  ): readonly string[] => {
    const values: string[] = [];

    for (const record of match.records) {
      const result = mapExternalList(record.source, axis, pick(record));
      for (const value of result.values) if (!values.includes(value)) values.push(value);
      for (const value of result.unmapped) unmapped.add(`${axis}:${value}`);
    }

    return values;
  };

  const primaryMuscles = mergeList((record) => record.primaryMuscles, 'muscle');
  const secondaryMuscles = mergeList((record) => record.secondaryMuscles, 'muscle').filter(
    // A muscle claimed as primary by one source and secondary by another counts
    // as primary: the stronger claim is the more useful default for a curator.
    (muscle) => !primaryMuscles.includes(muscle),
  );
  const equipment = mergeList((record) => record.equipment, 'equipment');

  const conflicts: { field: string; claims: string[] }[] = [];

  const agreed = (
    field: 'category' | 'forceType' | 'mechanic' | 'difficulty',
  ): string | undefined => {
    const claims = new Map<string, string>();

    for (const record of match.records) {
      const value = record[field];
      if (value === undefined || value.trim() === '') continue;

      const outcome = mapExternalValue(record.source, field, value);

      // **Dropped is not unmapped.** A wger body region is deliberately not
      // represented on this axis; treating it as a gap would report a decision
      // we already took as work still to do — which is what it did, for 855 of
      // 1674 candidates, until this told them apart.
      if (outcome.kind === 'dropped') continue;
      if (outcome.kind === 'unmapped') {
        unmapped.add(`${field}:${value}`);
        continue;
      }

      claims.set(outcome.value, record.source);
    }

    if (claims.size === 0) return undefined;
    if (claims.size === 1) return [...claims.keys()][0];

    conflicts.push({ field, claims: [...claims.keys()] });

    return undefined;
  };

  const category = agreed('category');
  const forceType = agreed('forceType');
  const mechanic = agreed('mechanic');
  const difficulty = agreed('difficulty');

  const variantsOf = [
    ...new Set(match.records.flatMap((record) => record.variantsOf.map((value) => value.trim()))),
  ].filter((value) => value !== '');

  const missing: string[] = [];
  if (primaryMuscles.length === 0) missing.push('primaryMuscles');
  if (equipment.length === 0) missing.push('equipment (or confirm bodyweight)');
  if (category === undefined) missing.push('category');
  if (forceType === undefined) missing.push('forceType');
  if (mechanic === undefined) missing.push('mechanic');
  if (difficulty === undefined) missing.push('difficulty');
  if (!match.records.some((record) => record.instructions.length > 0)) missing.push('instructions');
  // Always: the German name is ours to choose, never a source's translation.
  missing.push('German name');

  return {
    fingerprint: match.fingerprint,
    suggestedCanonicalName: match.name,
    names: match.records.map((record) => ({ source: record.source, name: record.name })),
    sources: match.sources,
    corroboration: match.sources.length,
    primaryMuscles,
    secondaryMuscles,
    equipment,
    category,
    forceType,
    mechanic,
    difficulty,
    unmapped: [...unmapped].sort(),
    conflicts,
    variantsOf,
    provenance: match.records.map((record) => ({
      source: record.source,
      sourceId: record.sourceId,
      license: record.license,
    })),
    missing,
  };
}

/** The pool a curator would start from: corroborated first, then the rest. */
export function rankedCandidates(candidates: readonly Candidate[]): readonly Candidate[] {
  return [...candidates].sort(
    (a, b) =>
      b.corroboration - a.corroboration ||
      a.missing.length - b.missing.length ||
      a.suggestedCanonicalName.localeCompare(b.suggestedCanonicalName),
  );
}

/** How many candidates each dataset combination produced. */
export function candidateSummary(candidates: readonly Candidate[]): {
  readonly total: number;
  readonly corroborated: number;
  readonly withConflicts: number;
  readonly withUnmapped: number;
  readonly readyExceptGermanName: number;
} {
  return {
    total: candidates.length,
    corroborated: corroborated(
      candidates.map((candidate) => ({
        fingerprint: candidate.fingerprint,
        name: candidate.suggestedCanonicalName,
        records: [],
        sources: candidate.sources,
      })),
    ).length,
    withConflicts: candidates.filter((candidate) => candidate.conflicts.length > 0).length,
    withUnmapped: candidates.filter((candidate) => candidate.unmapped.length > 0).length,
    readyExceptGermanName: candidates.filter(
      (candidate) => candidate.missing.length === 1 && candidate.missing[0] === 'German name',
    ).length,
  };
}
