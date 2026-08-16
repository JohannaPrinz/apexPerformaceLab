import { describe, expect, it } from 'vitest';

import { exercemusAdapter, wgerAdapter, wrkoutAdapter } from './adapters';
import { buildCandidates, candidateSummary, rankedCandidates } from './candidates';
import {
  compareVariants,
  corroborated,
  coverage,
  duplicatesWithinSource,
  findConflicts,
  matchMovements,
  unmappedValues,
  vocabularyUsage,
} from './compare';
import { hasField } from './neutral';
import { CATALOGUE_SOURCES, fetchableSources, findCatalogueSource } from './sources';

import type { NeutralDataset } from './neutral';

const meta = { fetchedOn: '2026-08-13', url: 'https://example.test/', license: 'Public Domain' };

/**
 * The analysis is only worth its numbers if the adapters read the sources
 * faithfully. These fixtures are the real shapes, cut down — the field names and
 * the quirks are exactly as the datasets publish them.
 */

describe('the wrkout adapter', () => {
  const raw = [
    {
      id: 'Barbell_Curl',
      name: 'Barbell Curl',
      force: 'pull',
      level: 'beginner',
      mechanic: 'isolation',
      // A single string, not a list — the shape quirk that matters.
      equipment: 'barbell',
      primaryMuscles: ['biceps'],
      secondaryMuscles: ['forearms'],
      instructions: ['Stand upright.', 'Curl the bar.'],
      category: 'strength',
      images: ['Barbell_Curl/0.jpg'],
    },
    { name: '' },
  ];

  const dataset = wrkoutAdapter(raw, meta);

  it('reads the record and lifts the single equipment string into a list', () => {
    expect(dataset.exercises).toHaveLength(1);
    expect(dataset.exercises[0]?.equipment).toEqual(['barbell']);
  });

  it('keeps the source vocabulary verbatim — nothing is translated here', () => {
    expect(dataset.exercises[0]?.primaryMuscles).toEqual(['biceps']);
    expect(dataset.exercises[0]?.difficulty).toBe('beginner');
    expect(dataset.exercises[0]?.forceType).toBe('pull');
  });

  it('reports a record it cannot read rather than skipping it', () => {
    expect(dataset.unreadable).toEqual([
      { index: 1, reason: 'No name, so nothing can identify it.' },
    ]);
  });

  it('carries the licence onto every record, so a claim can be traced', () => {
    expect(dataset.exercises[0]?.license).toBe('Public Domain');
    expect(dataset.exercises[0]?.sourceId).toBe('Barbell_Curl');
  });
});

describe('the exercemus adapter', () => {
  const dataset = exercemusAdapter(
    [
      {
        name: '3/4 Sit-Up',
        category: 'strength',
        description: 'Sit-Up performed 3/4 of the way up',
        equipment: ['none'],
        instructions: ['Lie down.'],
        primary_muscles: ['abs'],
        secondary_muscles: [],
        variations_on: ['sit-up'],
        video: 'https://example.test/v',
      },
    ],
    { ...meta, license: 'MIT' },
  );

  it('reads its snake_case fields and its variant relation', () => {
    expect(dataset.exercises[0]?.primaryMuscles).toEqual(['abs']);
    expect(dataset.exercises[0]?.variantsOf).toEqual(['sit-up']);
  });

  /** It has no id, so the name is the anchor — itself a finding worth naming. */
  it('falls back to the name as the source id', () => {
    expect(dataset.exercises[0]?.sourceId).toBe('3/4 Sit-Up');
  });
});

describe('the wger adapter', () => {
  const dataset = wgerAdapter(
    {
      results: [
        {
          id: 192,
          category: { name: 'Chest' },
          muscles: [{ name: 'Pectoralis major' }],
          muscles_secondary: [{ name: 'Triceps brachii' }],
          equipment: [{ name: 'Barbell' }],
          translations: [
            { language: 2, name: 'Bench Press', description: 'Press the bar.' },
            { language: 1, name: 'Bankdrücken', description: 'Drücken.' },
          ],
          images: [{ image: 'https://example.test/i.png' }],
        },
        { id: 2520, category: { name: 'Abs' }, translations: [] },
      ],
    },
    { ...meta, license: 'CC-BY-SA-4.0' },
  );

  it('unwraps the nested objects into flat lists', () => {
    expect(dataset.exercises[0]?.primaryMuscles).toEqual(['Pectoralis major']);
    expect(dataset.exercises[0]?.equipment).toEqual(['Barbell']);
    expect(dataset.exercises[0]?.category).toBe('Chest');
  });

  it('anchors on the English translation', () => {
    expect(dataset.exercises[0]?.name).toBe('Bench Press');
  });

  /** Thirteen real records have no translations at all. They are reported. */
  it('reports a record with no translation', () => {
    expect(dataset.unreadable).toHaveLength(1);
    expect(dataset.unreadable[0]?.reason).toContain('No English translation');
  });
});

// ── The comparison ───────────────────────────────────────────────────────────

const wrkout: NeutralDataset = wrkoutAdapter(
  [
    {
      id: 'Bench_Press',
      name: 'Barbell Bench Press',
      equipment: 'barbell',
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps'],
      instructions: ['Press.'],
      category: 'strength',
      force: 'push',
      mechanic: 'compound',
      level: 'expert',
    },
    {
      id: 'Squat',
      name: 'Barbell Squat',
      equipment: 'barbell',
      primaryMuscles: ['quadriceps'],
      instructions: ['Squat.'],
      category: 'powerlifting',
      level: 'intermediate',
    },
  ],
  meta,
);

const wger: NeutralDataset = wgerAdapter(
  {
    results: [
      {
        id: 192,
        category: { name: 'Chest' },
        muscles: [{ name: 'Pectoralis major' }],
        equipment: [{ name: 'Barbell' }],
        translations: [{ language: 2, name: 'Bench Press, Barbell' }],
      },
    ],
  },
  { ...meta, license: 'CC-BY-SA-4.0' },
);

describe('matching movements across sources', () => {
  const matches = matchMovements([wrkout, wger]);

  it('groups two spellings of one movement', () => {
    const bench = matches.find((match) => match.fingerprint.includes('bench'));

    expect(bench?.sources).toEqual(['wger', 'wrkout']);
  });

  it('leaves a movement only one source carries on its own', () => {
    expect(corroborated(matches).map((match) => match.name)).not.toContain('Barbell Squat');
  });

  it('finds no self-duplication in a clean dataset', () => {
    expect(duplicatesWithinSource(matches)).toEqual([]);
  });
});

/**
 * The number that matters most: a value is covered only when **every** source
 * using it can translate it. Asking "does anybody know this word" reported full
 * coverage while the candidate builder still found hundreds of gaps.
 */
describe('vocabulary coverage is asked per source', () => {
  it('reports a value one source can translate and another cannot', () => {
    const usage = vocabularyUsage([wrkout, wger], 'muscle');
    const chest = usage.find((entry) => entry.value === 'chest');

    expect(chest?.ours).toBe('mapped');
  });

  it('names which source lacks the entry', () => {
    const usage = vocabularyUsage([wrkout, wger], 'muscle');

    for (const entry of unmappedValues(usage)) {
      expect(entry.unmappedFor.length, entry.value).toBeGreaterThan(0);
    }
  });

  it('covers every muscle both fixtures use', () => {
    expect(unmappedValues(vocabularyUsage([wrkout, wger], 'muscle'))).toEqual([]);
  });
});

describe('conflicts are reported before mapping, never after', () => {
  const conflicts = findConflicts(matchMovements([wrkout, wger]));

  /**
   * wger says `Chest` (a body region), wrkout says `strength` (a training
   * type). Mapping resolves it — one axis is dropped — but the raw report must
   * still show the disagreement, because resolving it is the decision the
   * report exists to inform.
   */
  it('shows the body-region against training-type disagreement', () => {
    const category = conflicts.find((conflict) => conflict.field === 'category');

    expect(category?.claims.map((claim) => claim.value).sort()).toEqual(['chest', 'strength']);
  });
});

describe('field coverage', () => {
  const report = coverage([wrkout, wger]);

  it('reports what a source never carries', () => {
    const wgerCoverage = report.find((entry) => entry.source === 'wger');

    expect(wgerCoverage?.fields.instructions).toBe(0);
    expect(wgerCoverage?.fields.forceType).toBe(0);
  });

  it('treats an empty list as absent, because the two are indistinguishable', () => {
    expect(hasField(wrkout.exercises[1]!, 'secondaryMuscles')).toBe(false);
  });
});

describe('variant relations', () => {
  it('says plainly when a source expresses none', () => {
    const comparison = compareVariants([wrkout, wger]);

    expect(comparison.every((entry) => entry.withRelations === 0)).toBe(true);
    expect(comparison[0]?.note).toContain('no variant relations');
  });
});

// ── The candidate pool ───────────────────────────────────────────────────────

describe('the candidate pool', () => {
  const candidates = rankedCandidates(buildCandidates([wrkout, wger]));
  const bench = candidates.find((candidate) => candidate.fingerprint.includes('bench'))!;

  it('puts corroborated movements first', () => {
    expect(candidates[0]?.corroboration).toBe(2);
  });

  it('keeps every source name so the wording can be compared', () => {
    expect(bench.names.map((entry) => entry.source).sort()).toEqual(['wger', 'wrkout']);
  });

  it('translates the sources’ words into ours', () => {
    expect(bench.primaryMuscles).toEqual(['chest']);
    expect(bench.equipment).toEqual(['barbell']);
  });

  it('maps wrkout’s "expert" onto our "advanced"', () => {
    expect(bench.difficulty).toBe('advanced');
  });

  /**
   * Dropped is not unmapped. A wger body region is deliberately not represented
   * on the category axis; counting it as a gap reported a decision already
   * taken as work still to do.
   */
  it('does not report a deliberately dropped value as a gap', () => {
    expect(bench.unmapped).toEqual([]);
    expect(bench.category).toBe('strength');
  });

  it('carries provenance for every contributing record', () => {
    expect(bench.provenance.map((entry) => entry.source).sort()).toEqual(['wger', 'wrkout']);
    expect(bench.provenance.every((entry) => entry.license !== '')).toBe(true);
  });

  /** The German name is ours to choose — never a source's translation. */
  it('always lists the German name as still missing', () => {
    for (const candidate of candidates) {
      expect(candidate.missing, candidate.suggestedCanonicalName).toContain('German name');
    }
  });

  it('is not an import file — it has no key and no German name', () => {
    expect(bench).not.toHaveProperty('key');
    expect(bench).not.toHaveProperty('name');
  });

  it('summarises what a curator faces', () => {
    const summary = candidateSummary(candidates);

    expect(summary.total).toBe(candidates.length);
    expect(summary.corroborated).toBe(1);
  });
});

// ── The registry ─────────────────────────────────────────────────────────────

describe('the source registry', () => {
  it('records a licence and a check date for every source', () => {
    for (const source of CATALOGUE_SOURCES) {
      expect(source.license, source.key).not.toBe('');
      expect(source.checkedOn, source.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  /**
   * RepDB's free terms are CC BY-NC, which forbids commercial use. It is
   * registered so the option is visible and priced — not so it is read.
   */
  it('does not download the commercial source', () => {
    expect(findCatalogueSource('repdb')?.fetchable).toBe(false);
    expect(
      fetchableSources()
        .map((source) => source.key)
        .sort(),
    ).toEqual(['exercemus', 'wger', 'wrkout']);
  });
});
