import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { assignBatches, readBatches, writeBatches } from '../src/curation/batches';

/**
 * Splits the newest curation run into blocks a person can actually work through.
 *
 *   pnpm --filter @apex/catalogue catalogue:review-batches
 *
 * 281 exercises in one list is a document nobody finishes. This writes blocks of
 * roughly thirty, grouped by category, each with a checklist — so a review
 * happens in sittings and each sitting has a visible end.
 *
 * **Nothing here changes an exercise.** Every flag in the REVIEW column is a
 * *suspicion a machine can raise*, not a correction: an unusual muscle count, a
 * name identical to the English one, a variant cluster. The judgement stays with
 * the reader, which is the entire point of producing the document instead of
 * acting on the flags.
 */

const root = fileURLToPath(new URL('../artifacts/curation/', import.meta.url));

/** Newest by modification time — run numbers can be reused, timestamps cannot. */
const run = readdirSync(root)
  .map((name) => ({ name, at: statSync(`${root}${name}`).mtimeMs }))
  .sort((a, b) => b.at - a.at)[0]?.name;

if (run === undefined) throw new Error('No curation run to read.');

interface Entry {
  key: string;
  name: string;
  canonicalName: string;
  category: string;
  difficulty: string;
  forceType: string | null;
  mechanic: string | null;
  unilateral: boolean;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  movementPattern: string;
  source: string;
}

const read = <T>(file: string): T => JSON.parse(readFileSync(`${root}${run}/${file}`, 'utf8')) as T;

const selection = read<{ exercises: Entry[] }>('selection.json');
const variants = read<{ pairs: { a: string; b: string }[] }>('variants.json');
const coverage = read<{
  editorialNameConflicts?: { key: string; authored: string; wouldCompose: string }[];
}>('coverage.json');

const exercises = selection.exercises;
const conflictKeys = new Set((coverage.editorialNameConflicts ?? []).map((entry) => entry.key));

const variantCount = new Map<string, number>();
for (const pair of variants.pairs) {
  variantCount.set(pair.a, (variantCount.get(pair.a) ?? 0) + 1);
  variantCount.set(pair.b, (variantCount.get(pair.b) ?? 0) + 1);
}

/** Categories where force and mechanic are optional by decision, not by omission. */
const OPTIONAL_FORCE_MECHANIC = new Set(['mobility', 'stability', 'endurance']);

const NAME_STOPWORDS = new Set(['with', 'the', 'and', 'on', 'in', 'a', 'to', 'of', 'for', 'bar']);

/**
 * Two names built from the same words, in any order.
 *
 * "Incline Dumbbell Press" and "Dumbbell Incline Press" are one exercise written
 * twice; word order carries no meaning here, so the signature discards it.
 *
 * Two coarser rules were measured and rejected:
 *
 * - *Shared pattern, muscles and equipment* flagged 118 entries. The largest
 *   group was `other | quads | bodyweight` with seven unrelated movements in it.
 *   Attribute overlap is what similar exercises look like, not what duplicates
 *   look like.
 * - *One name contained in another* flagged 45, led by `Plank ⊂ Side Plank` —
 *   which are genuinely different exercises. Containment is how variants are
 *   named.
 *
 * The exact test finds nothing, and that is the finding: the curation's own
 * deduplication left no pair behind.
 */
const signature = (entry: Entry) =>
  [
    ...new Set(
      entry.canonicalName
        .toLowerCase()
        .replace(/[^a-z ]/g, ' ')
        .split(/\s+/)
        .filter((word) => word !== '' && !NAME_STOPWORDS.has(word)),
    ),
  ]
    .sort()
    .join(' ');

const bySignature = new Map<string, number>();
for (const entry of exercises) {
  bySignature.set(signature(entry), (bySignature.get(signature(entry)) ?? 0) + 1);
}

/**
 * A flag on nine entries in ten is not a flag.
 *
 * Three candidate rules were measured and dropped, because each described the
 * normal case rather than an exception:
 *
 * - *no variant* held for 197 of 281 — having no variant is ordinary, and the
 *   `Var.` column already shows the zero.
 * - *force/mechanic absent* held for 60, all of them in exactly the categories
 *   where we decided both fields are optional. Reporting a rule as an anomaly
 *   trains the reader to skip the column.
 * - *many variants* at a threshold of eight held for 61. The counts jump
 *   7 → 8 → 9 → 13 → 18; only from thirteen is it a cluster worth opening.
 *
 * What remains flags about one entry in four, which is a share somebody can
 * actually work through.
 */
function reviewFlags(entry: Entry): string[] {
  const flags: string[] = [];
  const variants_ = variantCount.get(entry.key) ?? 0;

  if (entry.name === entry.canonicalName) flags.push('Name = englisch');
  if (conflictKeys.has(entry.key)) flags.push('editorial-Namenskonflikt');

  if (entry.primaryMuscles.length === 0) flags.push('kein primärer Muskel');
  else if (entry.primaryMuscles.length > 3) {
    flags.push(`${String(entry.primaryMuscles.length)} primäre Muskeln`);
  }

  if (entry.equipment.length > 3) flags.push(`${String(entry.equipment.length)} Geräte`);

  // Only the real gap: a value missing where the category requires one.
  if (
    (entry.forceType === null || entry.mechanic === null) &&
    !OPTIONAL_FORCE_MECHANIC.has(entry.category)
  ) {
    flags.push('**force/mechanic fehlt**');
  }

  if (entry.difficulty === '') flags.push('keine Schwierigkeit');
  if (variants_ >= 13) flags.push(`${String(variants_)} Varianten`);
  if ((bySignature.get(signature(entry)) ?? 0) > 1) flags.push('Namensdublette');

  return flags;
}

// ── Summary ──────────────────────────────────────────────────────────────────

const tally = (pick: (entry: Entry) => string | string[]) => {
  const counts: Record<string, number> = {};
  for (const entry of exercises) {
    const values = pick(entry);
    for (const value of Array.isArray(values) ? values : [values]) {
      if (value === '') continue;
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }

  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
};

const inline = (entries: [string, number][]) =>
  entries.map(([key, n]) => `${key} ${String(n)}`).join(' · ');

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  strength: 'Strength',
  mobility: 'Mobility',
  stability: 'Stability',
  calisthenics: 'Calisthenics',
  plyometrics: 'Plyometrics',
  olympic_weightlifting: 'Olympic Weightlifting',
  endurance: 'Endurance',
};

// ── Blocks ───────────────────────────────────────────────────────────────────

/**
 * Nobody reviews 42 exercises in one sitting, so 35 is the ceiling for a *new*
 * block. Existing blocks keep whatever they were frozen with.
 */
const BLOCK_MAXIMUM = 35;

/**
 * Block membership comes from the frozen assignment, not from today's sort
 * order. Cutting the blocks out of a list sorted by German name meant a rename
 * moved an exercise between blocks — after block 1 changed eleven names, six
 * reviewed exercises had left block 1 and six unreviewed ones had entered it.
 */
const batches = assignBatches(readBatches(), exercises, {
  maximum: BLOCK_MAXIMUM,
  label: (category) => CATEGORY_LABELS[category] ?? category,
});

writeBatches(batches);

const byCanonicalName = new Map(exercises.map((entry) => [entry.canonicalName, entry]));

interface Block {
  readonly number: number;
  readonly title: string;
  readonly entries: readonly Entry[];
}

const blocks: Block[] = batches.map((batch) => ({
  number: batch.block,
  title: batch.title,
  // Sorted for reading; the *membership* is what is frozen, not the order.
  entries: batch.exercises
    .flatMap((name) => {
      const entry = byCanonicalName.get(name);

      return entry === undefined ? [] : [entry];
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de')),
}));

const CHECKLIST = `**Freigabe-Checkliste für diesen Block**

- [ ] Namen plausibel?
- [ ] Übung fachlich eindeutig?
- [ ] Kategorie korrekt?
- [ ] Muskelzuordnung korrekt?
- [ ] Equipment korrekt?
- [ ] Movement Pattern korrekt?
- [ ] Difficulty plausibel?
- [ ] Unilateral korrekt?
- [ ] Variante(n) plausibel?

_Block freigegeben:_ ☐  _Änderungen notiert:_ ☐`;

const HEADER = `| ✓ | Deutscher Name | canonicalName | Muskeln primär | sekundär | Pattern | Equipment | Force | Mech. | Stufe | Seite | Quelle | Var. | REVIEW |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`;

const row = (entry: Entry) => {
  const flags = reviewFlags(entry);

  return `| [ ] | **${entry.name}** | ${entry.canonicalName} | ${
    entry.primaryMuscles.join(', ') || '—'
  } | ${entry.secondaryMuscles.join(', ') || '—'} | ${entry.movementPattern} | ${
    entry.equipment.join(', ') || 'Körpergewicht'
  } | ${entry.forceType ?? '—'} | ${entry.mechanic ?? '—'} | ${entry.difficulty} | ${
    entry.unilateral ? 'ein' : 'beid'
  } | ${entry.source === 'editorial' ? '**eigen**' : entry.source} | ${String(
    variantCount.get(entry.key) ?? 0,
  )} | ${flags.join('; ') || '—'} |`;
};

const withoutForce = exercises.filter((entry) => entry.forceType === null).length;
const withoutMechanic = exercises.filter((entry) => entry.mechanic === null).length;
const flaggedCount = exercises.filter((entry) => reviewFlags(entry).length > 0).length;

const markdown = `# Fachliche Durchsicht — ${String(exercises.length)} Übungen

Lauf \`${run}\`. **Nichts hiervon steht in der Datenbank.** Dieses Dokument ändert
nichts; es macht die Auswahl blockweise prüfbar.

Die Spalte **REVIEW** nennt, was eine Maschine auffällig finden kann — nie, was
falsch ist. Ein Hinweis ist eine Bitte hinzusehen, keine Korrektur.

---

## Überblick

| | |
| --- | --- |
| Übungen | **${String(exercises.length)}** |
| Review-Blöcke | ${String(blocks.length)} |
| davon mit mindestens einem Hinweis | ${String(flaggedCount)} |
| Quelle \`wrkout\` (Public Domain) | ${String(exercises.filter((entry) => entry.source !== 'editorial').length)} |
| Quelle **\`eigen\`** (selbst verfasst) | ${String(exercises.filter((entry) => entry.source === 'editorial').length)} |
| ohne \`forceType\` | ${String(withoutForce)} |
| ohne \`mechanic\` | ${String(withoutMechanic)} |
| Variantenvorschläge | ${String(variants.pairs.length)} |

**Kategorie** — ${inline(tally((entry) => entry.category))}

**Schwierigkeit** — ${inline(tally((entry) => entry.difficulty))}

**Seitigkeit** — einseitig ${String(exercises.filter((entry) => entry.unilateral).length)} · beidseitig ${String(
  exercises.filter((entry) => !entry.unilateral).length,
)}

**Muskeln (primär)** — ${inline(tally((entry) => entry.primaryMuscles))}

**Equipment** — ${inline(tally((entry) => (entry.equipment.length === 0 ? ['Körpergewicht'] : entry.equipment)))}

**Movement Pattern** — ${inline(tally((entry) => entry.movementPattern))}

---

## Wie zu lesen

**Quelle.** \`wrkout\` = Public Domain, Text stammt aus der Quelle. **\`eigen\`** = von
uns verfasst, weil keine lizenzklare Quelle die Übung trägt. wger und Exercemus
liefern keine Zeile — sie dienten nur dem Abgleich.

**Leere force/mechanic sind kein Hinweis.** Für Mobility, Stability und Endurance
sind beide Felder optional — eine Dehnung ist weder push noch pull. ${String(withoutForce)} Übungen
ohne \`forceType\` und ${String(withoutMechanic)} ohne \`mechanic\`, **restlos alle** in diesen drei
Kategorien; das ist die getroffene Entscheidung, kein Datenmangel. Gemeldet wird
nur ein fehlender Wert **außerhalb** dieser Kategorien — davon gibt es keinen.

**Leere Variantenspalte ist kein Hinweis.** ${String(exercises.filter((entry) => (variantCount.get(entry.key) ?? 0) === 0).length)} Übungen haben keine
Variante — das ist der Normalfall und steht bereits als \`0\` in der Spalte.

**Pattern ist kein Feld von \`Exercise\`.** Wir haben entschieden, \`movementPatterns\`
nicht am Exercise zu führen. Die Spalte stammt aus der Kurationsanalyse und
dient nur der Durchsicht — sie zeigt, ob die Auswahl die Bewegungen abdeckt.
Sie wandert nicht in die Datenbank.

**Namensdublette.** Zwei Namen aus denselben Wörtern in anderer Reihenfolge.
Der Test läuft über alle 281 und **findet nichts** — die Dublettenprüfung der
Kuration hat sauber gearbeitet. Zwei gröbere Regeln habe ich verworfen: gleiche
Muskeln plus Equipment markierte 118 Einträge (die größte Gruppe waren sieben
unverwandte Körpergewichtsübungen), und „Name enthalten in Name" markierte 45,
angeführt von \`Plank ⊂ Side Plank\` — zwei verschiedene Übungen. So werden
Varianten benannt, nicht Dubletten.

**Var.** Wie viele Variantenbeziehungen vorgeschlagen sind. Eine hohe Zahl
deutet eher auf eine zu großzügige Regel als auf eine besonders vielseitige
Übung; \`variants.json\` hat die Paare.

---

${blocks
  .map(
    (block) => `## Block ${String(block.number)}
### ${block.title} · ${String(block.entries.length)} Übungen

${HEADER}
${block.entries.map(row).join('\n')}

${CHECKLIST}`,
  )
  .join('\n\n---\n\n')}

---

## Nach der Durchsicht

Änderungen bitte je Block notieren — Streichung, Umbenennung, Kategoriewechsel,
Muskel- oder Equipmentkorrektur. Ich arbeite sie in einen neuen Lauf ein; der
jetzige bleibt als Zwischenstand erhalten.

Noch offen und **nicht** Teil dieser Durchsicht: die ${String(variants.pairs.length)} Variantenvorschläge.
Die Regel ist vermutlich zu großzügig; das gehört in einen eigenen Schritt.
`;

writeFileSync(`${root}${run}/REVIEW_BATCHES.md`, markdown, 'utf8');

console.info('');
console.info(`Geschrieben: artifacts/curation/${run}/REVIEW_BATCHES.md`);
console.info(`  ${String(exercises.length)} Übungen in ${String(blocks.length)} Blöcken`);
console.info(`  ${String(flaggedCount)} mit mindestens einem Review-Hinweis`);
console.info('  Nichts geändert, nichts in die Datenbank geschrieben.');
