import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { fetchableSources } from '../src/sources';

/**
 * Downloads each readable source into a versioned artefact.
 *
 *   pnpm --filter @apex/catalogue catalogue:fetch
 *
 * One directory per source per day: `artifacts/<source>/<date>/raw.json`, with
 * a `meta.json` beside it recording where it came from, under what licence and
 * when. That is what makes the analysis reproducible — a later reader can see
 * which version of a dataset a conclusion was drawn from, and re-run against it.
 *
 * The artefacts are **not committed**. They run to several megabytes and change
 * wholesale when a source republishes; what belongs in the repository is the
 * normalised comparison, which is small and reviewable. This script recreates
 * them from the URLs in the registry.
 *
 * Sources marked `fetchable: false` are skipped and said so — RepDB's free
 * terms are CC BY-NC, which forbids commercial use, so it is not downloaded at
 * all rather than downloaded and then set aside.
 */

const today = new Date().toISOString().slice(0, 10);
const root = fileURLToPath(new URL('../artifacts/', import.meta.url));

/**
 * wger paginates. Followed to the end rather than taking the first page,
 * because a partial dataset would make every count in the analysis wrong in a
 * way nothing downstream could detect.
 */
async function fetchAll(url: string): Promise<unknown> {
  const first: unknown = await (await fetch(url)).json();

  if (typeof first !== 'object' || first === null || !('results' in first)) return first;

  const container = first as { results: unknown[]; next?: string | null };
  const results = [...container.results];
  let next = container.next ?? null;
  let pages = 1;

  while (typeof next === 'string' && next !== '' && pages < 60) {
    const page: unknown = await (await fetch(next)).json();
    if (typeof page !== 'object' || page === null || !('results' in page)) break;

    const parsed = page as { results: unknown[]; next?: string | null };
    results.push(...parsed.results);
    next = parsed.next ?? null;
    pages++;
  }

  return { results, pages };
}

for (const source of fetchableSources()) {
  const directory = `${root}${source.key}/${today}/`;
  mkdirSync(directory, { recursive: true });

  process.stdout.write(`${source.key.padEnd(12)} fetching… `);

  try {
    const raw = await fetchAll(source.url);
    const count = Array.isArray(raw)
      ? raw.length
      : typeof raw === 'object' && raw !== null && 'results' in raw
        ? (raw as { results: unknown[] }).results.length
        : Array.isArray((raw as { exercises?: unknown[] })?.exercises)
          ? (raw as { exercises: unknown[] }).exercises.length
          : 0;

    writeFileSync(`${directory}raw.json`, JSON.stringify(raw), 'utf8');
    writeFileSync(
      `${directory}meta.json`,
      JSON.stringify(
        {
          source: source.key,
          name: source.name,
          url: source.url,
          license: source.license,
          fetchedOn: today,
          records: count,
          note: source.note,
        },
        null,
        2,
      ),
      'utf8',
    );

    console.info(`${String(count)} records → artifacts/${source.key}/${today}/`);
  } catch (error) {
    console.info(`failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.info('');
for (const source of [...fetchableSources()]) void source;
console.info('Not downloaded, deliberately:');
console.info(
  '  repdb        CC BY-NC for evaluation; commercial use requires a paid licence, so it is not read into an analysis that informs a commercial catalogue.',
);
