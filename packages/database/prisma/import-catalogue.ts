import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';

import { blocksImport } from '@apex/domain';

import { PrismaClient } from '../generated/prisma/client.js';
import { importExercises } from '../src/import-exercises';
import '../src/load-env';

/**
 * Imports a catalogue file into the **system** catalogue.
 *
 *   pnpm db:import-exercises [file] [--dry-run]
 *
 * Defaults to the small verification set. The real catalogue replaces the file
 * argument once it is curated and approved; nothing about this script changes.
 *
 * System scope by default and by design: a workspace import would need a coach
 * to attribute the rows to, and the catalogue this command exists for is the
 * shared one.
 */

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileArgument = args.find((argument) => !argument.startsWith('--'));

const path =
  fileArgument ?? fileURLToPath(new URL('./catalogue/test-exercises.json', import.meta.url));

const connectionString = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];
if (!connectionString) throw new Error('No DIRECT_URL or DATABASE_URL. Check your .env.');

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const file: unknown = JSON.parse(readFileSync(path, 'utf8'));

const result = await importExercises(db, file, { organizationId: null, dryRun });

console.info(`Catalogue: ${path}`);
console.info(`Entries:   ${String(result.plan.entries.length)}`);

if (result.problems.length > 0) {
  console.info('');
  console.info('Refused:');
  for (const problem of result.problems) console.info(`  - ${problem}`);
}

if (result.duplicates.length > 0) {
  console.info('');
  console.info('Possible duplicates:');
  for (const candidate of result.duplicates) {
    console.info(`  ${blocksImport(candidate) ? '[blocks]' : '[review]'} ${candidate.detail}`);
  }
}

console.info('');
if (result.written) {
  console.info(
    `Written: ${String(result.created)} created, ${String(result.updated)} updated, ` +
      `${String(result.variantsLinked)} variant links.`,
  );
} else {
  console.info(dryRun ? 'Dry run — nothing written.' : 'Nothing written.');
}

await db.$disconnect();
