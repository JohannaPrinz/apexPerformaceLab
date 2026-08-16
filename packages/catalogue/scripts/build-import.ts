import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Turns an approved curation run into the file the importer reads.
 *
 *   pnpm --filter @apex/catalogue catalogue:build-import <run>
 *
 * The run is named explicitly and there is **no fallback**: no "newest", no
 * default, no test file. A production import must be traceable to one approved
 * state, and a script that silently picks something else when the argument is
 * missing is how the wrong catalogue reaches a database.
 *
 * Deterministic: same run in, byte-identical file out. Exercises sorted by key,
 * relationships by pair, so a diff between two builds shows what changed in the
 * catalogue rather than what changed in the iteration order.
 */

const root = fileURLToPath(new URL('../artifacts/curation/', import.meta.url));
const run = process.argv[2];

if (run === undefined || run === '') {
  throw new Error(
    'Name the run explicitly, for example 2026-08-16-r18. There is no default — an import must be traceable to an approved state.',
  );
}

interface Entry {
  key: string;
  name: string;
  canonicalName: string;
  description?: string;
  instructions: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  category: string;
  forceType: string | null;
  mechanic: string | null;
  difficulty: string;
  unilateral: boolean;
  media: { source: string; url: string; license: string }[];
  source: string;
  sourceId: string;
  license: string;
}

const read = <T>(file: string): T => JSON.parse(readFileSync(`${root}${run}/${file}`, 'utf8')) as T;

const exercises = read<{ exercises: Entry[] }>('selection.json').exercises;
const variants = read<{ pairs: { a: string; b: string; type: string; basis: string }[] }>(
  'variants.json',
).pairs;

const byKey = new Map(exercises.map((entry) => [entry.key, entry]));

// ── Relationships ────────────────────────────────────────────────────────────

/**
 * Declared on the alphabetically first key only.
 *
 * The relationship is symmetric and the importer stores one row per pair, so
 * declaring it twice would be noise. Choosing the first key rather than
 * whichever side the curation happened to write makes the output stable.
 */
const relationships = new Map<string, { key: string; type: string }[]>();
const dangling: string[] = [];
const seenPairs = new Set<string>();

for (const pair of variants) {
  if (!byKey.has(pair.a) || !byKey.has(pair.b)) {
    dangling.push(`${pair.a} ↔ ${pair.b}`);
    continue;
  }

  const [first, second] = pair.a < pair.b ? [pair.a, pair.b] : [pair.b, pair.a];
  const id = `${first}|${second}`;

  if (seenPairs.has(id)) continue;
  seenPairs.add(id);

  const list = relationships.get(first) ?? [];
  list.push({ key: second, type: pair.type });
  relationships.set(first, list);
}

// ── Write ────────────────────────────────────────────────────────────────────

const file = {
  formatVersion: 1,
  _note: [
    `Built from curation run ${run} by scripts/build-import.ts.`,
    'Do not edit by hand: correct the curation and rebuild, so the file and the',
    'approved state cannot drift apart.',
    '',
    'MEDIA IS NOT INCLUDED. wrkout publishes relative paths such as',
    '"Barbell_Ab_Rollout/0.jpg", and the media schema requires an http(s) URL.',
    'Turning one into the other means choosing a host name, which would be an',
    'invention rather than a conversion. The references stay in the curation',
    'run; this remains a known, deliberately unresolved matter.',
  ],
  exercises: [...exercises]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => ({
      key: entry.key,
      name: entry.name,
      canonicalName: entry.canonicalName,
      description: entry.description,
      instructions: entry.instructions,
      primaryMuscles: entry.primaryMuscles,
      secondaryMuscles: entry.secondaryMuscles,
      equipment: entry.equipment,
      category: entry.category,
      // The schema says absent, not null: a field with no value is left out
      // rather than carrying a placeholder the reader has to interpret.
      ...(entry.forceType === null ? {} : { forceType: entry.forceType }),
      ...(entry.mechanic === null ? {} : { mechanic: entry.mechanic }),
      difficulty: entry.difficulty,
      unilateral: entry.unilateral,
      source: entry.source,
      sourceId: entry.sourceId,
      license: entry.license,
      relationships: (relationships.get(entry.key) ?? []).sort((a, b) =>
        a.key.localeCompare(b.key),
      ),
    })),
};

const out = fileURLToPath(
  new URL('../../database/prisma/catalogue/catalogue.json', import.meta.url),
);

writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`, 'utf8');

const byType = [...relationships.values()].flat().reduce<Record<string, number>>((counts, item) => {
  counts[item.type] = (counts[item.type] ?? 0) + 1;

  return counts;
}, {});

console.info('');
console.info(`Gebaut aus ${run}`);
console.info(`  ${String(file.exercises.length)} Übungen`);
console.info(
  `  ${String(seenPairs.size)} Beziehungen — ${Object.entries(byType)
    .map(([type, count]) => `${String(count)} ${type}`)
    .join(', ')}`,
);
if (dangling.length > 0) {
  console.info(`  ${String(dangling.length)} verworfen, weil eine Seite fehlt:`);
  for (const pair of dangling) console.info(`    ${pair}`);
}
console.info(
  `  Medien ausgelassen: ${String(exercises.filter((entry) => entry.media.length > 0).length)} Übungen führen relative wrkout-Pfade, die das Schema nicht zulässt`,
);
console.info(`  geschrieben: packages/database/prisma/catalogue/catalogue.json`);
console.info('  Nichts in die Datenbank geschrieben.');
