import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { exerciseImportSchema, planExerciseImport } from '@apex/domain';

/**
 * The built import artefact, checked against what r18 approved.
 *
 * This is the last gate before a production write: the file the importer will
 * read is parsed by the importer's own schema and planned by its own planner,
 * so a shape the database would reject fails here instead of there.
 */

const path = fileURLToPath(
  new URL('../../../database/prisma/catalogue/catalogue.json', import.meta.url),
);

const file = exerciseImportSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
const plan = planExerciseImport(file, []);

describe('the import artefact built from r18', () => {
  it('holds exactly the approved 276 exercises', () => {
    expect(file.exercises).toHaveLength(276);
  });

  it('holds 77 relationships — 43 alternative, 34 related', () => {
    expect(plan.variantPairs).toHaveLength(77);

    const byType = plan.variantPairs.reduce<Record<string, number>>((counts, pair) => {
      counts[pair.type] = (counts[pair.type] ?? 0) + 1;

      return counts;
    }, {});

    expect(byType).toEqual({ alternative: 43, related: 34 });
  });

  it('names each exercise once', () => {
    const keys = file.exercises.map((entry) => entry.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('declares each relationship once', () => {
    const pairs = plan.variantPairs.map((pair) => `${pair.a}|${pair.b}`);

    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('points every relationship at an exercise the file has', () => {
    const keys = new Set(file.exercises.map((entry) => entry.key));

    for (const pair of plan.variantPairs) {
      expect(keys.has(pair.a), pair.a).toBe(true);
      expect(keys.has(pair.b), pair.b).toBe(true);
    }
  });

  it('is accepted by the importer without a single problem', () => {
    expect(plan.problems).toEqual([]);
  });

  /**
   * The artefact is r18 and nothing else.
   *
   * Note what this does *not* claim: that no key appears in both files.
   * `dumbbell_bench_press` is in the fixtures and in the catalogue, because it
   * is the same movement — which is exactly why the fixtures have to be deleted
   * from the database before the import rather than merged with it.
   */
  it('adds no exercise the curation run did not approve', () => {
    const approved = new Set(
      (
        JSON.parse(
          readFileSync(
            fileURLToPath(
              new URL('../../artifacts/curation/2026-08-16-r18/selection.json', import.meta.url),
            ),
            'utf8',
          ),
        ) as { exercises: { key: string }[] }
      ).exercises.map((entry) => entry.key),
    );

    for (const entry of file.exercises) {
      expect(approved.has(entry.key), entry.key).toBe(true);
    }

    expect(file.exercises).toHaveLength(approved.size);
  });

  it('carries the four settled name and removal decisions', () => {
    const names = new Map(file.exercises.map((entry) => [entry.canonicalName, entry.name]));

    expect(names.get('Weighted Squat')).toBe('Kniebeuge mit Gewicht');
    expect(names.get('Calf Raise On A Dumbbell')).toBe('Wadenheben auf einer Kurzhantel');
    expect(names.has('Dumbbell Prone Incline Curl')).toBe(false);
    expect(names.has('Lying Crossover')).toBe(false);
  });

  it('ships German text for every entry', () => {
    for (const entry of file.exercises) {
      expect(entry.description, entry.key).toBeDefined();
      expect(entry.instructions.length, entry.key).toBeGreaterThanOrEqual(2);
    }
  });
});
