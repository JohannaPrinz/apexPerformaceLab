/**
 * The datasets this package reads, and the terms they arrive under.
 *
 * Verified in August 2026 by reading each source, not from memory. `checkedOn`
 * records when, so a later reader knows how stale this is.
 *
 * ## Reading is not importing
 *
 * A dataset listed here may be *downloaded and compared*. Whether any of its
 * content may end up in the product is a separate decision, recorded in
 * `@apex/domain` → `exercises/sources`, and that registry currently approves
 * none of them. Nothing in this package writes to the database.
 *
 * `fetchable: false` means the data is not downloaded at all — not because it
 * is uninteresting, but because its terms do not permit it.
 */

export interface CatalogueSource {
  readonly key: string;
  readonly name: string;
  /** Where the machine-readable data lives, or the project page when there is none. */
  readonly url: string;
  readonly license: string;
  readonly checkedOn: string;
  /** Whether this package downloads it. */
  readonly fetchable: boolean;
  readonly note: string;
}

export const CATALOGUE_SOURCES: readonly CatalogueSource[] = [
  {
    key: 'wrkout',
    name: 'wrkout / exercises.json',
    // The combined build. The upstream repository ships one file per exercise
    // and a build step; this mirror publishes the assembled result, which is
    // the same data in one request instead of several hundred.
    url: 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json',
    license: 'Public Domain (Unlicense)',
    checkedOn: '2026-08-13',
    fetchable: true,
    note: 'The primary candidate. Public domain, and the only source carrying force, mechanic and level — the three fields our taxonomy could not source anywhere else. Carries no variant relations.',
  },
  {
    key: 'wger',
    name: 'wger',
    // `exerciseinfo` rather than the older `exercisebaseinfo`, which now
    // returns HTML — checked against the API root in August 2026.
    url: 'https://wger.de/api/v2/exerciseinfo/?format=json&limit=100',
    license: 'CC-BY-SA-4.0',
    checkedOn: '2026-08-12',
    fetchable: true,
    note: 'Share-alike. Read as a comparison source: its muscle vocabulary is Latin and its categories are body regions, both of which are useful contrasts even if its rows are never imported.',
  },
  {
    key: 'exercemus',
    name: 'Exercemus',
    url: 'https://raw.githubusercontent.com/exercemus/exercises/minified/minified-exercises.json',
    license: 'MIT',
    checkedOn: '2026-08-12',
    fetchable: true,
    note: 'Itself curated from wger and exercises.json, so overlap with both is expected — which makes it the best source for variant relations, the one thing it adds that neither parent has.',
  },
  {
    key: 'repdb',
    name: 'RepDB',
    url: 'https://repdb.co/',
    license: 'CC-BY-NC-4.0 (evaluation) / commercial licence from USD 199',
    checkedOn: '2026-08-13',
    // Deliberately not downloaded.
    fetchable: false,
    note: 'Commercial. The free terms are CC BY-NC, which forbids commercial use outright, and this is a commercial product — so even reading it into a comparison that informs our catalogue is the wrong side of the line. Registered so the option is visible and priced, not so it is used. Buying the commercial licence would change this.',
  },
];

export function findCatalogueSource(key: string): CatalogueSource | undefined {
  return CATALOGUE_SOURCES.find((source) => source.key === key);
}

export function fetchableSources(): readonly CatalogueSource[] {
  return CATALOGUE_SOURCES.filter((source) => source.fetchable);
}
