import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isDecided } from '../src/curation/variants';

/**
 * The duplicate candidates, side by side, with what it takes to judge them.
 *
 *   pnpm --filter @apex/catalogue catalogue:duplicates
 *
 * A pair qualifies when the catalogue's own data cannot tell the two apart —
 * same category, movement pattern, primary muscles, equipment and sidedness —
 * **and** their German names largely coincide. Attribute overlap alone was
 * measured and rejected: it groups the sit-up with the hanging leg raise, which
 * are plainly different exercises.
 *
 * The instructions are printed in full, because that is usually where the
 * difference either appears or turns out not to exist. Deciding from names
 * alone is what produced the duplicates in the first place.
 */

const root = fileURLToPath(new URL('../artifacts/curation/', import.meta.url));

const run = readdirSync(root)
  .map((name) => ({ name, at: statSync(`${root}${name}`).mtimeMs }))
  .sort((a, b) => b.at - a.at)[0]?.name;

if (run === undefined) throw new Error('No curation run to read.');

interface Entry {
  name: string;
  canonicalName: string;
  category: string;
  difficulty: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  movementPattern: string;
  unilateral: boolean;
  instructions: string[];
  source: string;
}

const exercises = (
  JSON.parse(readFileSync(`${root}${run}/selection.json`, 'utf8')) as { exercises: Entry[] }
).exercises;

const signature = (entry: Entry) =>
  [
    entry.category,
    entry.movementPattern,
    [...entry.primaryMuscles].sort().join(','),
    [...entry.equipment].sort().join(',') || 'Körpergewicht',
    entry.unilateral ? 'einseitig' : 'beidseitig',
  ].join(' · ');

const NAME_NOISE = new Set(['mit', 'am', 'im', 'auf', 'in', 'der', 'die', 'das', 'einer', 'dem']);

const words = (entry: Entry) =>
  new Set(
    entry.name
      .toLowerCase()
      .replace(/[^a-zäöüß ]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !NAME_NOISE.has(word)),
  );

const overlap = (a: Entry, b: Entry): number => {
  const first = words(a);
  const second = words(b);

  return [...first].filter((word) => second.has(word)).length / Math.min(first.size, second.size);
};

const pairs = exercises
  .flatMap((a, index) =>
    exercises.slice(index + 1).flatMap((b) =>
      signature(a) === signature(b) &&
      overlap(a, b) >= 0.6 &&
      // Already judged — a pair confirmed as two exercises, or linked as a
      // variant, must not come back for a second decision.
      !isDecided(a.canonicalName, b.canonicalName)
        ? [{ a, b, overlap: overlap(a, b), signature: signature(a) }]
        : [],
    ),
  )
  .sort((a, b) => b.overlap - a.overlap);

const steps = (entry: Entry) =>
  entry.instructions.map((step, index) => `  ${String(index + 1)}. ${step}`).join('\n');

const german = (entry: Entry) =>
  entry.source === 'editorial' || /[äöüß]|^Die |^Der /.test(entry.instructions[0] ?? '');

const markdown = `# Dublettenkandidaten — zur Prüfung

Lauf \`${run}\`. **${String(pairs.length)} Paare.** Nichts hiervon ist in der Datenbank; dieses
Dokument ändert nichts.

## Wie die Paare zustande kommen

Ein Paar erscheint hier, wenn **beides** zutrifft:

1. Die strukturierten Daten unterscheiden die beiden nicht — gleiche Kategorie,
   gleiches Bewegungsmuster, gleiche primäre Muskeln, gleiches Equipment,
   gleiche Seitigkeit.
2. Die deutschen Namen teilen mindestens 60 % ihrer bedeutungstragenden Wörter.

Nur das erste Kriterium reicht nicht: Es stellt Sit-up, reversen Crunch und
hängendes Beinheben nebeneinander, weil alle drei \`strength · trunk_flexion ·
abs\` sind. Verschiedene Übungen, gleiche Daten.

Die Instructions stehen vollständig dabei, weil der Unterschied dort entweder
sichtbar wird — oder sich als nicht vorhanden herausstellt.

## Wie Sie entscheiden

Pro Paar eine von drei Antworten:

- **behalten** — zwei eigenständige Übungen; wenn der Unterschied in den Daten
  fehlt, sagen Sie welches Feld ihn tragen soll.
- **zusammenführen** — eine bleibt, die andere entfällt; nennen Sie welche.
- **variante** — beide bleiben und werden später als Varianten verknüpft.

---

${pairs
  .map(
    (pair, index) => `## ${String(index + 1)}. ${pair.a.name} ↔ ${pair.b.name}

\`${pair.signature}\` · Namensüberschneidung ${String(Math.round(pair.overlap * 100))} %

**Entscheidung:** ☐ behalten ☐ zusammenführen ☐ variante — _______________

### ${pair.a.name}
\`${pair.a.canonicalName}\` · ${pair.a.difficulty} · ${pair.a.source}${german(pair.a) ? '' : ' · **Instructions noch englisch**'}
sekundär: ${pair.a.secondaryMuscles.join(', ') || '—'}

${steps(pair.a)}

### ${pair.b.name}
\`${pair.b.canonicalName}\` · ${pair.b.difficulty} · ${pair.b.source}${german(pair.b) ? '' : ' · **Instructions noch englisch**'}
sekundär: ${pair.b.secondaryMuscles.join(', ') || '—'}

${steps(pair.b)}`,
  )
  .join('\n\n---\n\n')}
`;

writeFileSync(`${root}${run}/DUPLICATES.md`, markdown, 'utf8');

console.info('');
console.info(`Geschrieben: artifacts/curation/${run}/DUPLICATES.md`);
console.info(`  ${String(pairs.length)} Paare zur Prüfung`);
console.info(
  `  davon mit mindestens einer englischen Anleitung: ${String(pairs.filter((pair) => !german(pair.a) || !german(pair.b)).length)}`,
);
console.info('  Nichts geändert, nichts in die Datenbank geschrieben.');
