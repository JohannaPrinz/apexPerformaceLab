import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Turns the newest curation run into something a person can actually read.
 *
 *   pnpm --filter @apex/catalogue catalogue:review-list
 *
 * `selection.json` holds 280 objects with a dozen fields each. Reviewing that is
 * a bad afternoon. This writes one table per category, sorted, with the columns
 * a reviewer needs and none of the ones they do not — and it puts the entries
 * most likely to be wrong at the top, so the hour spent goes where it pays.
 *
 * Writes into the run it read, beside the artefacts. Changes nothing else.
 */

const root = fileURLToPath(new URL('../artifacts/curation/', import.meta.url));
/**
 * Newest by modification time, not by name.
 *
 * Sorting the directory names put `-r4` after `-r3` and read a stale run — the
 * numbers are not zero-padded and a deleted run can leave a gap, so the name
 * says nothing reliable about which state is current.
 */
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
  instructions: string[];
  source: string;
}

const selection = JSON.parse(readFileSync(`${root}${run}/selection.json`, 'utf8')) as {
  exercises: Entry[];
};

const variants = JSON.parse(readFileSync(`${root}${run}/variants.json`, 'utf8')) as {
  pairs: { a: string; b: string }[];
};

/**
 * Which German names deserve a second look.
 *
 * Three signals, each a way the composition can go wrong:
 *
 * - **Untranslated.** The German name equals the English one. Sometimes right
 *   (Burpee, Dead Bug) and sometimes a term that simply was not in the table.
 * - **Adjectival prefix.** A composed name beginning with a lower-case word is
 *   the construction that produces "gehende Laufband" — German adjective
 *   agreement the table cannot get right on its own.
 * - **Over-composed.** Three or more hyphens usually means a name nobody says.
 *
 * The flag is a *suspicion*, not a verdict: plenty of flagged names are fine.
 * It exists so a reviewer reads 60 entries closely instead of 280 evenly.
 */
function suspicion(entry: Entry): string | null {
  if (entry.name === entry.canonicalName) return 'identical to the English name';
  if (/^[a-zäöüß]/.test(entry.name)) return 'starts with an adjective — check agreement';
  if ((entry.name.match(/-/g) ?? []).length >= 3) return 'heavily compounded';

  return null;
}

const flagged = selection.exercises.filter((entry) => suspicion(entry) !== null);
const variantCount = new Map<string, number>();

for (const pair of variants.pairs) {
  variantCount.set(pair.a, (variantCount.get(pair.a) ?? 0) + 1);
  variantCount.set(pair.b, (variantCount.get(pair.b) ?? 0) + 1);
}

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  strength: 'Kraft',
  mobility: 'Mobilität',
  stability: 'Stabilität',
  calisthenics: 'Körpergewicht',
  plyometrics: 'Plyometrie',
  olympic_weightlifting: 'Olympisches Gewichtheben',
  endurance: 'Ausdauer',
};

const row = (entry: Entry) =>
  `| ${entry.name} | ${entry.canonicalName} | ${entry.primaryMuscles.join(', ') || '—'} | ${
    entry.equipment.join(', ') || 'Körpergewicht'
  } | ${entry.difficulty} | ${entry.unilateral ? 'ein' : 'beid'} | ${
    entry.source === 'editorial' ? '**eigen**' : entry.source
  } | ${String(variantCount.get(entry.key) ?? 0)} |`;

const header = `| Deutscher Name | Englisch | Primäre Muskeln | Equipment | Stufe | Seite | Quelle | Var. |
| --- | --- | --- | --- | --- | --- | --- | --- |`;

const categories = [...new Set(selection.exercises.map((entry) => entry.category))].sort(
  (a, b) =>
    selection.exercises.filter((entry) => entry.category === b).length -
    selection.exercises.filter((entry) => entry.category === a).length,
);

const sections = categories
  .map((category) => {
    const entries = selection.exercises
      .filter((entry) => entry.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));

    const own = entries.filter((entry) => entry.source === 'editorial').length;

    return `## ${CATEGORY_LABELS[category] ?? category} · ${String(entries.length)}

${own > 0 ? `${String(own)} davon selbst verfasst.\n` : ''}
${header}
${entries.map(row).join('\n')}`;
  })
  .join('\n\n');

const markdown = `# Prüfliste — ${String(selection.exercises.length)} Übungen

Lauf \`${run}\`. Nichts hiervon steht in der Datenbank.

**Spalte „Quelle":** \`wrkout\` = Public Domain, Text aus der Quelle. **\`eigen\`** = von uns
verfasst, weil keine lizenzklare Quelle die Übung trägt. wger und Exercemus
liefern keine Zeile — sie dienten nur dem Abgleich.

**Spalte „Var.":** wie viele Variantenbeziehungen vorgeschlagen sind. Eine hohe
Zahl deutet auf eine zu großzügige Regel hin, nicht auf eine besonders
vielseitige Übung.

**Spalte „Seite":** \`ein\` = einseitig ausgeführt, \`beid\` = beidseitig.

---

## Zuerst hier hinsehen · ${String(flagged.length)} Namen

Diese deutschen Namen sind maschinell zusammengesetzt und **wahrscheinlich
korrekturbedürftig**. Der Verdacht ist kein Urteil — vieles davon ist richtig.

| Deutscher Name | Englisch | Warum auffällig |
| --- | --- | --- |
${flagged
  .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  .map((entry) => `| ${entry.name} | ${entry.canonicalName} | ${suspicion(entry) ?? ''} |`)
  .join('\n')}

---

${sections}

---

## Was beim Lesen zu entscheiden ist

1. **Deutscher Name** — stimmt der Fachbegriff? Die oben markierten zuerst.
2. **Eigenständigkeit** — ist das eine eigene Übung oder eine Ausführungsvariante,
   die in \`instructions\` gehört?
3. **Kategorie** — sitzt die Übung im richtigen Bereich?
4. **Primäre Muskeln** — die Quelle war hier gelegentlich großzügig.
5. **Varianten** — die Spalte rechts; bei hohen Zahlen lohnt ein Blick in
   \`variants.json\`.

Streichungen, Umbenennungen und Kategoriewechsel bitte direkt notieren; ich
arbeite sie in einen finalen Lauf ein.
`;

writeFileSync(`${root}${run}/REVIEW_LIST.md`, markdown, 'utf8');

console.info('');
console.info(`Prüfliste: artifacts/curation/${run}/REVIEW_LIST.md`);
console.info(
  `  ${String(selection.exercises.length)} Übungen in ${String(categories.length)} Kategorien`,
);
console.info(`  ${String(flagged.length)} Namen zuerst prüfen`);
console.info(
  `  ${String(selection.exercises.filter((entry) => entry.source === 'editorial').length)} selbst verfasst`,
);
