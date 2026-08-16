import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ADAPTERS } from '../src/adapters';
import { buildCandidates, candidateSummary, rankedCandidates } from '../src/candidates';
import {
  compareVariants,
  corroborated,
  coverage,
  duplicatesWithinSource,
  findConflicts,
  matchMovements,
  unmappedValues,
  vocabularyUsage,
} from '../src/compare';
import { findCatalogueSource } from '../src/sources';

import type { NeutralDataset } from '../src/neutral';

/**
 * Reads the newest artefact of each source, normalises it, and writes the
 * comparison.
 *
 *   pnpm --filter @apex/catalogue catalogue:analyse
 *
 * Two outputs, both small enough to commit and read:
 *
 * - `artifacts/normalised.json` — every record in the neutral shape, with its
 *   source, that source's id and its licence. This is the versioned comparison
 *   dataset the raw downloads are reduced to.
 * - `artifacts/candidates.json` — one row per movement, gathering what each
 *   source says and what a curator still has to decide.
 *
 * The summary below goes to the console, because the numbers are the point.
 */

const root = fileURLToPath(new URL('../artifacts/', import.meta.url));

function newestArtifact(source: string): { raw: unknown; fetchedOn: string } | null {
  const directory = `${root}${source}/`;
  if (!existsSync(directory)) return null;

  const dates = readdirSync(directory).sort().reverse();
  const newest = dates[0];
  if (!newest || !existsSync(`${directory}${newest}/raw.json`)) return null;

  return {
    raw: JSON.parse(readFileSync(`${directory}${newest}/raw.json`, 'utf8')) as unknown,
    fetchedOn: newest,
  };
}

const datasets: NeutralDataset[] = [];

for (const [key, adapter] of Object.entries(ADAPTERS)) {
  const artifact = newestArtifact(key);
  const source = findCatalogueSource(key);

  if (!artifact || !source) {
    console.info(`${key.padEnd(12)} no artefact — run catalogue:fetch first`);
    continue;
  }

  datasets.push(
    adapter(artifact.raw, {
      fetchedOn: artifact.fetchedOn,
      url: source.url,
      license: source.license,
    }),
  );
}

if (datasets.length === 0) {
  console.info('Nothing to analyse.');
  process.exit(0);
}

const line = (label: string, value: string) => console.info(`  ${label.padEnd(34)} ${value}`);

console.info('');
console.info('══ Datasets ══');
for (const dataset of datasets) {
  line(
    dataset.source,
    `${String(dataset.exercises.length)} records · ${dataset.license} · fetched ${dataset.fetchedOn}` +
      (dataset.unreadable.length > 0 ? ` · ${String(dataset.unreadable.length)} unreadable` : ''),
  );
}

console.info('');
console.info('══ Field coverage (share of records carrying the field) ══');
for (const entry of coverage(datasets)) {
  const fields = Object.entries(entry.fields)
    .filter(([, share]) => share > 0)
    .map(([field, share]) => `${field} ${String(Math.round(share * 100))}%`)
    .join(' · ');
  line(entry.source, fields === '' ? 'nothing' : fields);
  const absent = Object.entries(entry.fields)
    .filter(([, share]) => share === 0)
    .map(([field]) => field);
  if (absent.length > 0) line('', `absent: ${absent.join(', ')}`);
}

const matches = matchMovements(datasets);
const shared = corroborated(matches);

console.info('');
console.info('══ Movements ══');
line('distinct movements', String(matches.length));
line('in more than one source', String(shared.length));
line('in one source only', String(matches.length - shared.length));

const withinSource = duplicatesWithinSource(matches);
if (withinSource.length > 0) {
  console.info('');
  console.info('══ A source duplicating itself ══');
  for (const entry of withinSource.slice(0, 10)) {
    line(entry.source, `${entry.name} × ${String(entry.count)}`);
  }
  if (withinSource.length > 10) line('', `… and ${String(withinSource.length - 10)} more`);
}

console.info('');
console.info('══ Vocabulary: what the sources say, and what we make of it ══');
for (const axis of ['muscle', 'equipment', 'category'] as const) {
  const usage = vocabularyUsage(datasets, axis);
  const open = unmappedValues(usage);
  line(
    axis,
    `${String(usage.length)} distinct values · ${String(usage.length - open.length)} covered · ${String(open.length)} unmapped`,
  );
  for (const entry of open.slice(0, 12)) {
    line(
      '  unmapped',
      `${entry.value} (${String(entry.total)}× — no table entry for ${entry.unmappedFor.join(', ')})`,
    );
  }
  if (open.length > 12) line('', `… and ${String(open.length - 12)} more`);
}

const conflicts = findConflicts(matches);
console.info('');
console.info('══ Where the sources contradict each other ══');
// Raw claims, compared before any mapping. A wger body region against a wrkout
// training type is a conflict *here* and resolved in the candidate pool, where
// the mapping has already decided that wger's categories are a different axis.
line('conflicting raw claims', String(conflicts.length));
for (const conflict of conflicts.slice(0, 12)) {
  line(
    `  ${conflict.field}`,
    `${conflict.name}: ${conflict.claims.map((claim) => `${claim.source}="${claim.value}"`).join(' vs ')}`,
  );
}
if (conflicts.length > 12) line('', `… and ${String(conflicts.length - 12)} more`);

console.info('');
console.info('══ Variant relations ══');
for (const entry of compareVariants(datasets)) {
  line(entry.source, `${entry.note} ${String(entry.pairs.length)} distinct pairs.`);
}

const candidates = rankedCandidates(buildCandidates(datasets));
const summary = candidateSummary(candidates);

console.info('');
console.info('══ Candidate pool ══');
line('candidates', String(summary.total));
line('corroborated by 2+ sources', String(summary.corroborated));
line('unresolved after mapping', String(summary.withConflicts));
line('with an unmapped value', String(summary.withUnmapped));
line('complete but for a German name', String(summary.readyExceptGermanName));

mkdirSync(root, { recursive: true });
writeFileSync(
  `${root}normalised.json`,
  JSON.stringify(
    {
      generatedOn: new Date().toISOString().slice(0, 10),
      datasets: datasets.map((dataset) => ({
        source: dataset.source,
        license: dataset.license,
        fetchedOn: dataset.fetchedOn,
        url: dataset.url,
        records: dataset.exercises.length,
        unreadable: dataset.unreadable,
        exercises: dataset.exercises.map(({ raw: _raw, ...rest }) => rest),
      })),
    },
    null,
    2,
  ),
  'utf8',
);

writeFileSync(
  `${root}candidates.json`,
  JSON.stringify({ generatedOn: new Date().toISOString().slice(0, 10), candidates }, null, 2),
  'utf8',
);

console.info('');
console.info('Written: artifacts/normalised.json, artifacts/candidates.json');
console.info('Neither is an import file. Nothing was written to the database.');
