import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { nameFingerprint } from '@apex/domain';

import { DESCRIPTIONS } from '../src/curation/descriptions';
import { EDITORIAL_EXERCISES } from '../src/curation/editorial';
import { overriddenFields, reviewDecision, REVIEWED } from '../src/curation/reviewed';
import { globalRuleChanges, type RuleChange } from '../src/curation/rules';
import { curate, movementPattern, type CuratedExercise } from '../src/curation/select';
import { composeGermanName } from '../src/curation/terms';
import { TRANSLATIONS } from '../src/curation/translations';
import { NOT_RELATED, RELATIONSHIPS } from '../src/curation/variants';

import type { Candidate } from '../src/candidates';

/**
 * Curates the research pool into a reviewable MVP catalogue proposal.
 *
 *   pnpm --filter @apex/catalogue catalogue:curate
 *
 * **Writes nothing to the database.** The output is a dated directory of
 * artefacts under `artifacts/curation/<date>/`, which is the whole deliverable:
 * a proposal a person reads, corrects and approves before anything is imported.
 *
 * Provenance runs through untouched — wrkout is the primary basis because it is
 * public domain and the only source carrying force, mechanic and difficulty;
 * wger and Exercemus corroborate and are recorded, never preferred.
 */

const root = fileURLToPath(new URL('../artifacts/', import.meta.url));
const today = new Date().toISOString().slice(0, 10);

/**
 * A new directory per run, never an overwrite.
 *
 * Each curation run is a reproducible intermediate state: a later reader must be
 * able to see what the previous rules produced and what changed. A second run on
 * the same day gets a suffix rather than replacing the first.
 */
function runDirectory(): string {
  const base = `${root}curation/${today}`;

  // The run number counts runs, not runs *per day*. Restarting it each morning
  // made "r5" ambiguous the moment a second day was involved, and the review is
  // conducted by run number. The date stays in the name because it answers a
  // different question — when — and the number answers which.
  const numbers = existsSync(`${root}curation`)
    ? readdirSync(`${root}curation`).flatMap((name) => {
        const match = /-r(\d+)$/.exec(name);

        return match ? [Number(match[1])] : [];
      })
    : [];

  const highest = Math.max(1, ...numbers);

  // The next number above the highest, never the first free gap: a deleted run
  // must not have its number reused, or two different states share a name in
  // anyone's notes.
  return `${base}-r${String(highest + 1)}/`;
}

const out = runDirectory();

interface NormalisedFile {
  datasets: {
    source: string;
    license: string;
    exercises: {
      name: string;
      sourceId: string;
      description?: string;
      instructions: string[];
      media: string[];
    }[];
  }[];
}

const normalised = JSON.parse(readFileSync(`${root}normalised.json`, 'utf8')) as NormalisedFile;
const pool = (
  JSON.parse(readFileSync(`${root}candidates.json`, 'utf8')) as { candidates: Candidate[] }
).candidates;

/**
 * Text, by movement.
 *
 * Preferred from wrkout — it is public domain, so its prose can be shipped;
 * wger's is CC-BY-SA and Exercemus's provenance is unsettled, so neither is
 * taken even where it is fuller. That is a licence decision showing up as a
 * data decision, which is exactly where it should show up.
 */
const text = new Map<
  string,
  {
    description?: string;
    instructions: string[];
    media: { source: string; url: string; license: string }[];
  }
>();

for (const dataset of normalised.datasets) {
  for (const record of dataset.exercises) {
    const fingerprint = nameFingerprint(record.name);
    if (fingerprint === '') continue;

    const existing = text.get(fingerprint);
    const preferred = dataset.source === 'wrkout';

    if (existing && !preferred) continue;

    text.set(fingerprint, {
      description: dataset.source === 'wrkout' ? undefined : record.description,
      instructions:
        dataset.source === 'wrkout' ? record.instructions : (existing?.instructions ?? []),
      media: record.media.map((url) => ({ source: dataset.source, url, license: dataset.license })),
    });
  }
}

// ── Curate ───────────────────────────────────────────────────────────────────

const excluded: { candidate: string; reason: string }[] = [];
const curated: (CuratedExercise & { corroboration: number })[] = [];

for (const candidate of pool) {
  const result = curate(candidate);

  if (!result.ok) {
    excluded.push({ candidate: candidate.suggestedCanonicalName, reason: result.reason });
    continue;
  }

  const prose = text.get(candidate.fingerprint);
  const instructions = prose?.instructions ?? [];

  const review = [...result.exercise.review];
  if (instructions.length === 0) {
    review.push('No instructions from a licence-clear source.');
  }

  curated.push({
    ...result.exercise,
    description: prose?.description,
    instructions,
    media: prose?.media.slice(0, 3) ?? [],
    review,
    corroboration: candidate.corroboration,
  });
}

// ── Select to the target distribution ────────────────────────────────────────

/**
 * Targets from the specification. Not quotas: a category that cannot fill its
 * target is reported short rather than padded, and one that overshoots because
 * the material is genuinely there is left alone.
 */
const TARGETS: Readonly<Record<string, number>> = {
  strength: 130,
  mobility: 45,
  endurance: 35,
  stability: 35,
  calisthenics: 30,
  plyometrics: 25,
  olympic_weightlifting: 20,
};

const clean = curated.filter((entry) => entry.review.length === 0);
const needsReview = curated.filter((entry) => entry.review.length > 0);

const selected: typeof curated = [];
const byCategory = new Map<string, typeof curated>();

for (const entry of clean) {
  const group = byCategory.get(entry.category) ?? [];
  group.push(entry);
  byCategory.set(entry.category, group);
}

/**
 * Within a category, spread across movement patterns before taking depth.
 *
 * Taking the best-corroborated hundred would produce forty presses and no
 * hinge. This walks the patterns in turn, taking one from each, so breadth is
 * reached before any pattern is exhausted.
 */
for (const [category, group] of byCategory) {
  const target = TARGETS[category] ?? 0;
  if (target === 0) continue;

  const buckets = new Map<string, typeof curated>();
  for (const entry of group) {
    const bucket = buckets.get(entry.movementPattern) ?? [];
    bucket.push(entry);
    buckets.set(entry.movementPattern, bucket);
  }

  for (const bucket of buckets.values()) {
    bucket.sort(
      (a, b) =>
        b.corroboration - a.corroboration ||
        b.instructions.length - a.instructions.length ||
        a.canonicalName.length - b.canonicalName.length,
    );
  }

  const order = [...buckets.keys()];
  let taken = 0;
  let round = 0;

  while (taken < target && round < 200) {
    let tookAny = false;

    for (const pattern of order) {
      if (taken >= target) break;
      const entry = buckets.get(pattern)?.[round];
      if (!entry) continue;

      selected.push(entry);
      taken++;
      tookAny = true;
    }

    if (!tookAny) break;
    round++;
  }
}

/**
 * A German name may not collide.
 *
 * Two rows a coach cannot tell apart in a picker are worse than one row fewer,
 * and the collision is a signal: the composed name dropped a qualifier the
 * English name carried. The later of the two goes to review with the reason,
 * rather than being reported as a defect after selection.
 */
const seenGerman = new Map<string, string>();
const deduplicated: typeof selected = [];

for (const entry of selected) {
  const clash = seenGerman.get(entry.name);

  if (clash === undefined) {
    seenGerman.set(entry.name, entry.canonicalName);
    deduplicated.push(entry);
    continue;
  }

  needsReview.push({
    ...entry,
    review: [
      `German name "${entry.name}" collides with "${clash}". The composed name lost a qualifier the English name carries.`,
    ],
  });
}

selected.length = 0;
selected.push(...deduplicated);

/**
 * Editorial exercises, added after selection.
 *
 * They are not candidates and are not selected against a target: they exist
 * precisely because the pool could not fill these areas. Each is written here,
 * so no licence question arises and no source text is copied.
 *
 * A movement the pool already covers is **not** added twice — the public-domain
 * row wins, because a sourced entry is worth more than one we wrote.
 */
const alreadyCovered = new Set(
  selected.flatMap((entry) => [entry.canonicalName.toLowerCase(), entry.name.toLowerCase()]),
);
const editorialAdded: typeof selected = [];

for (const entry of EDITORIAL_EXERCISES) {
  // Matched on **both** names. A pool row called "Plank" and an editorial
  // "Forearm Plank" are the same movement to a coach reading German, and the
  // sourced row wins — a public-domain entry is worth more than one we wrote.
  if (
    alreadyCovered.has(entry.canonicalName.toLowerCase()) ||
    alreadyCovered.has(entry.name.toLowerCase())
  ) {
    continue;
  }

  editorialAdded.push({
    ...entry,
    media: [],
    provenance: [{ source: 'editorial', sourceId: entry.key, license: entry.license }],
    movementPattern: movementPattern(entry.canonicalName),
    review: [],
    conflicts: [],
    corroboration: 0,
  });
}

selected.push(...editorialAdded);

/**
 * Editorial names are never rewritten by the composition.
 *
 * They were written by a person; a rule that quietly replaced them would undo
 * that work without saying so. Where the composition *would* produce something
 * different, it is reported as a conflict and the authored name stands.
 */
const editorialConflicts = editorialAdded.flatMap((entry) => {
  const composed = composeGermanName(entry.canonicalName);

  return composed.name !== '' && composed.name !== entry.name
    ? [{ key: entry.key, authored: entry.name, wouldCompose: composed.name }]
    : [];
});

// ── Human review ─────────────────────────────────────────────────────────────

/**
 * The reviewed decisions overlay the generated ones, last.
 *
 * Order matters: the overlay runs *after* selection, deduplication and the
 * editorial merge, so a decision applies to the entry that actually shipped. It
 * deliberately does not feed back into the rules — a rule hand-patched for one
 * exercise is no longer a rule, and the next run would hide the patch.
 *
 * German instructions arriving from a decision are our text over wrkout's data.
 * The attribution stays with wrkout and a second provenance entry records the
 * German wording as ours, so neither claim is lost.
 */
const reviewApplied: {
  canonicalName: string;
  block: number;
  note: string;
  fields: readonly string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}[] = [];

for (const [index, entry] of selected.entries()) {
  const decision = reviewDecision(entry.canonicalName);
  if (decision === undefined) continue;

  const fields = overriddenFields(decision);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  for (const field of fields) {
    before[field] = entry[field as keyof typeof entry];
    after[field] = decision[field as keyof typeof decision];
  }

  const germanText = fields.includes('instructions');

  selected[index] = {
    ...entry,
    ...Object.fromEntries(fields.map((field) => [field, after[field]])),
    provenance: germanText
      ? [
          ...entry.provenance,
          {
            source: 'editorial',
            sourceId: `block-${String(decision.block)}-german-text`,
            license: 'Proprietary — authored for Apex OS',
          },
        ]
      : entry.provenance,
  };

  reviewApplied.push({
    canonicalName: entry.canonicalName,
    block: decision.block,
    note: decision.note,
    fields,
    before,
    after,
  });
}

/**
 * The catalogue-wide rules run after the individual decisions, so a considered
 * judgement on one exercise is never overwritten by a rule.
 */
const ruleChanges: RuleChange[] = [];

for (const [index, entry] of selected.entries()) {
  const decided = new Set(
    overriddenFields(
      reviewDecision(entry.canonicalName) ?? { block: 0, canonicalName: '', note: '' },
    ),
  );
  const changes = globalRuleChanges(entry).filter((change) => !decided.has(change.field));
  if (changes.length === 0) continue;

  selected[index] = {
    ...entry,
    ...Object.fromEntries(changes.map((change) => [change.field, change.to])),
  };

  ruleChanges.push(...changes);
}

/**
 * Translations, applied after the review decisions.
 *
 * These entries had nothing to correct, so no decision was recorded — which is
 * exactly why they kept their English text. Applied only where the review left
 * the instructions untouched, so a decision always wins over a translation.
 */
const translated: string[] = [];

for (const [index, entry] of selected.entries()) {
  const translation = TRANSLATIONS.find((item) => item.canonicalName === entry.canonicalName);
  if (translation === undefined) continue;

  const decided = overriddenFields(
    reviewDecision(entry.canonicalName) ?? { block: 0, canonicalName: '', note: '' },
  );

  if (decided.includes('instructions')) continue;

  selected[index] = {
    ...entry,
    instructions: translation.instructions,
    provenance: [
      ...entry.provenance,
      {
        source: 'editorial',
        sourceId: 'translation-german-text',
        license: 'Proprietary — authored for Apex OS',
      },
    ],
  };

  translated.push(entry.canonicalName);
}

/**
 * Descriptions, applied last.
 *
 * One sentence that says what this exercise does that the one beside it does
 * not — the field that makes the 131 exercises with identical filter attributes
 * distinguishable in a picker.
 */
const described: string[] = [];

for (const [index, entry] of selected.entries()) {
  const description = DESCRIPTIONS.find((item) => item.canonicalName === entry.canonicalName);
  if (description === undefined) continue;

  selected[index] = { ...entry, description: description.description };
  described.push(entry.canonicalName);
}

const descriptionsWithoutMatch = DESCRIPTIONS.filter(
  (item) => !selected.some((entry) => entry.canonicalName === item.canonicalName),
).map((item) => item.canonicalName);

const translationsWithoutMatch = TRANSLATIONS.filter(
  (item) => !selected.some((entry) => entry.canonicalName === item.canonicalName),
).map((item) => item.canonicalName);

const reviewedButMissing = REVIEWED.filter(
  (decision) => !selected.some((entry) => entry.canonicalName === decision.canonicalName),
).map((decision) => decision.canonicalName);

/**
 * Exercises the review struck out.
 *
 * Removed after the overlay and before variants and coverage, so every count in
 * the run describes the catalogue that actually remains. The reasons are kept —
 * a run six weeks from now still has to answer why something a reader remembers
 * is no longer there.
 */
const removed = REVIEWED.flatMap((decision) =>
  decision.remove === undefined
    ? []
    : selected
        .filter((entry) => entry.canonicalName === decision.canonicalName)
        .map((entry) => ({
          canonicalName: entry.canonicalName,
          name: entry.name,
          block: decision.block,
          reason: decision.remove ?? '',
        })),
);

const removedNames = new Set(removed.map((entry) => entry.canonicalName));

for (let index = selected.length - 1; index >= 0; index--) {
  if (removedNames.has(selected[index]?.canonicalName ?? '')) selected.splice(index, 1);
}

const reviewConflicts = REVIEWED.flatMap((decision) =>
  decision.conflict === undefined
    ? []
    : [
        {
          canonicalName: decision.canonicalName,
          block: decision.block,
          conflict: decision.conflict,
        },
      ],
);

const selectedKeys = new Set(selected.map((entry) => entry.key));
const notSelected = clean.filter((entry) => !selectedKeys.has(entry.key));

// ── Variant proposals ────────────────────────────────────────────────────────

/**
 * **The automatic proposals are discarded.** Decided after the catalogue review.
 *
 * They were generated by matching a family word in the English name — `squat`,
 * `row`, `curl` — and then linking every member of a family to every other. Two
 * things were wrong with that, and the second is fatal:
 *
 * - 403 pairs across ten families, one of them 19 exercises producing 171 pairs
 *   on its own. Nobody reviews that.
 * - Membership rests on the word, not the movement. The squat family declared
 *   the front squat, the jump squat and the rear-foot-elevated split squat
 *   variants of one another; the curl family held the Nordic curl, the seated
 *   leg curl and the wrist curl — four muscle groups joined by one syllable.
 *
 * That is precisely the rule the review set: *no variants from name similarity
 * alone.* A generator that cannot honour it should produce nothing rather than
 * something plausible-looking.
 *
 * `variants.json` therefore ships empty. Variants will be set by hand from the
 * families the review confirmed, and the file records which those are so the
 * next step starts from evidence rather than from a regular expression.
 */
const byCanonicalName = new Map(selected.map((entry) => [entry.canonicalName, entry]));

const variantProposals = RELATIONSHIPS.flatMap((pair) => {
  const a = byCanonicalName.get(pair.a);
  const b = byCanonicalName.get(pair.b);

  // A pair naming an exercise the catalogue no longer holds is dropped rather
  // than written half-resolved; `variantsWithoutMatch` reports it.
  if (a === undefined || b === undefined) return [];

  return [
    {
      a: a.key < b.key ? a.key : b.key,
      b: a.key < b.key ? b.key : a.key,
      type: pair.type,
      basis: pair.basis,
    },
  ];
});

const variantsWithoutMatch = RELATIONSHIPS.filter(
  (pair) => !byCanonicalName.has(pair.a) || !byCanonicalName.has(pair.b),
).map((pair) => `${pair.a} ↔ ${pair.b}`);

/**
 * Families the review found sound — the starting point for the manual step, not
 * a set of variants. Each was read through exercise by exercise in its block.
 */
const CONFIRMED_FAMILIES: readonly string[] = [
  'Bankdrücken — flach, schräg, negativ, Kurz- und Langhantel, Maschine',
  'Kreuzheben — konventionell, Sumo, Defizit, rumänisch',
  'Rudern — vorgebeugt, einarmig, Kurzhantel, Langhantel, Kettlebell',
  'Umsetzen — Langhantel, Kettlebell, aus dem Hang',
  'Kniebeuge — nur die Kniebeugen: Front, Nacken, Kurzhantel, Hack, Maschine',
];

const uniquePairs = [
  ...new Map(variantProposals.map((pair) => [`${pair.a}|${pair.b}`, pair])).values(),
];

// ── Coverage ─────────────────────────────────────────────────────────────────

const count = <T>(items: readonly T[], pick: (item: T) => string | string[]) => {
  const tally: Record<string, number> = {};
  for (const item of items) {
    const values = pick(item);
    for (const value of Array.isArray(values) ? values : [values]) {
      if (value === '') continue;
      tally[value] = (tally[value] ?? 0) + 1;
    }
  }

  return Object.fromEntries(Object.entries(tally).sort((a, b) => b[1] - a[1]));
};

const coverageReport = {
  generatedOn: today,
  total: selected.length,
  targets: TARGETS,
  byCategory: count(selected, (entry) => entry.category),
  byDifficulty: count(selected, (entry) => entry.difficulty),
  byForceType: count(selected, (entry) => entry.forceType ?? 'not applicable'),
  byMechanic: count(selected, (entry) => entry.mechanic ?? 'not applicable'),
  byEquipment: count(selected, (entry) =>
    entry.equipment.length === 0 ? ['bodyweight'] : [...entry.equipment],
  ),
  byPrimaryMuscle: count(selected, (entry) => [...entry.primaryMuscles]),
  byMovementPattern: count(selected, (entry) => entry.movementPattern),
  unilateral: {
    yes: selected.filter((entry) => entry.unilateral).length,
    no: selected.filter((entry) => !entry.unilateral).length,
  },
  variantProposals: uniquePairs.length,
  editorialAdded: editorialAdded.length,
  reviewCases: needsReview.length,
  excluded: excluded.length,
  notSelectedButClean: notSelected.length,
};

// ── Quality checks ───────────────────────────────────────────────────────────

const problems: string[] = [];

const duplicateCanonical = Object.entries(count(selected, (entry) => entry.canonicalName)).filter(
  ([, n]) => n > 1,
);
const duplicateGerman = Object.entries(count(selected, (entry) => entry.name)).filter(
  ([, n]) => n > 1,
);

if (duplicateCanonical.length > 0) {
  problems.push(`Duplicate canonical names: ${duplicateCanonical.map(([n]) => n).join(', ')}`);
}
if (duplicateGerman.length > 0) {
  problems.push(`Duplicate German names: ${duplicateGerman.map(([n]) => n).join(', ')}`);
}

for (const entry of selected) {
  if (entry.name === '') problems.push(`${entry.canonicalName}: no German name.`);
  if (entry.instructions.length === 0) problems.push(`${entry.canonicalName}: no instructions.`);
  if (entry.primaryMuscles.length === 0)
    problems.push(`${entry.canonicalName}: no primary muscle.`);
  if (entry.source === '' || entry.license === '') {
    problems.push(`${entry.canonicalName}: provenance incomplete.`);
  }
}

for (const pair of uniquePairs) {
  if (pair.a === pair.b) problems.push(`Self-referencing variant pair: ${pair.a}`);
  if (!selectedKeys.has(pair.a) || !selectedKeys.has(pair.b)) {
    problems.push(`Variant pair references an unselected exercise: ${pair.a} ↔ ${pair.b}`);
  }
}

// ── Write ────────────────────────────────────────────────────────────────────

mkdirSync(out, { recursive: true });

const write = (file: string, value: unknown) =>
  writeFileSync(`${out}${file}`, JSON.stringify(value, null, 2), 'utf8');

write('selection.json', {
  generatedOn: today,
  count: selected.length,
  exercises: selected,
});
write('review.json', {
  generatedOn: today,
  count: needsReview.length,
  exercises: needsReview,
});
write('excluded.json', {
  generatedOn: today,
  count: excluded.length,
  excluded: excluded.sort((a, b) => a.reason.localeCompare(b.reason)),
});
write('variants.json', {
  note: 'Von Hand gesetzt. Die 403 automatisch erzeugten Paare wurden verworfen: Die Familienzugehörigkeit hing am Namenswort, nicht an der Bewegung. Paare werden nicht zu Cliquen erweitert — wo drei Übungen zusammengehören, stehen alle drei Paare einzeln.',
  confirmedFamilies: CONFIRMED_FAMILIES,
  withoutMatch: variantsWithoutMatch,
  confirmedDistinct: NOT_RELATED,
  generatedOn: today,
  count: uniquePairs.length,
  pairs: uniquePairs,
});
write('coverage.json', {
  ...coverageReport,
  qualityProblems: problems,
  editorialNameConflicts: editorialConflicts,
  reviewedBlocks: [...new Set(REVIEWED.map((decision) => decision.block))],
  reviewDecisionsApplied: reviewApplied.length,
  reviewDecisionsWithoutMatch: reviewedButMissing,
  globalRuleChanges: ruleChanges,
  translationsApplied: translated.length,
  descriptionsApplied: described.length,
  descriptionsWithoutMatch,
  descriptionsMissing: selected.filter((entry) => entry.description === undefined).length,
  translationsWithoutMatch,
  openConflicts: reviewConflicts,
  removedByReview: removed,
  germanInstructions: selected.filter((entry) =>
    entry.provenance.some((source) => source.sourceId.endsWith('-german-text')),
  ).length,
});

// ── Changelog ────────────────────────────────────────────────────────────────

/**
 * What a decision changed, field by field, in a file a person reads.
 *
 * `selection.json` shows the result; it cannot show what the result replaced.
 * Without this, the only way to answer "why does this row say glutes when the
 * source said hamstrings" is to diff two runs by hand.
 */
const fieldLabels: Readonly<Record<string, string>> = {
  name: 'Deutscher Name',
  category: 'Kategorie',
  primaryMuscles: 'Primäre Muskeln',
  secondaryMuscles: 'Sekundäre Muskeln',
  equipment: 'Equipment',
  forceType: 'forceType',
  mechanic: 'mechanic',
  difficulty: 'Schwierigkeit',
  instructions: 'Instructions',
};

/**
 * A field value as a table cell.
 *
 * Short strings — muscles, equipment — are listed in full. Instruction steps are
 * counted instead, because a changelog table with four paragraphs in one cell is
 * not a table any more; the steps themselves are in `selection.json`.
 */
const show = (value: unknown): string => {
  if (value === null || value === undefined) return '—';

  if (Array.isArray(value)) {
    const items: unknown[] = value;
    if (items.length === 0) return '—';

    return items.every((item) => typeof item === 'string' && item.length < 40)
      ? items.join(', ')
      : `${String(items.length)} Schritte`;
  }

  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  return JSON.stringify(value) ?? '—';
};

const changesByField = count(
  reviewApplied.flatMap((change) => change.fields.map((field) => ({ field }))),
  (change) => change.field,
);

const changelog = `# Änderungen dieses Laufs

Lauf \`${out.split(/[/\\]/).filter(Boolean).at(-1) ?? ''}\`, erzeugt ${today}.
**Nichts hiervon ist in der Datenbank.** Kein Import, kein Schemawechsel.

## Globale Regeln

Regeln, die für den ganzen Katalog gelten. Sie laufen **nach** den
Einzelentscheidungen — eine geprüfte Festlegung wird nie von einer Regel
überschrieben. ${String(ruleChanges.length)} Änderungen durch Regeln.

| Regel | | Änderungen |
| --- | --- | --- |
| **A** | Gerätename wird nachgestellt: „Bankdrücken mit Kurzhanteln", nicht „Kurzhantel-Bankdrücken". Etablierte Fachbegriffe bleiben. | in der Namenskomposition |
| **B** | Blockzugehörigkeit ist eingefroren und an \`canonicalName\` gebunden. Eine Umbenennung verschiebt keine Übung mehr. | \`review-batches.json\` |
| **C** | Körpergewicht allein macht keine Übung zu \`calisthenics\`. | 0 — bestätigt den Bestand |
| **D** | Explosive Sprung- und Wurfbewegungen sind \`plyometrics\`; Zusatzlast ändert das nicht. | ${String(ruleChanges.filter((change) => change.rule === 'D').length)} |
| **E** | Hüftstreckung zieht: Kreuzheben, Romanian Deadlift und Good Morning einheitlich \`pull\`. | ${String(ruleChanges.filter((change) => change.rule === 'E').length)} |
| **F** | Front- und Seitheben einheitlich \`pull\`. | ${String(ruleChanges.filter((change) => change.rule === 'F').length)} |

${
  ruleChanges.length === 0
    ? '_Keine._'
    : `| Regel | Übung | Feld | vorher | nachher |
| --- | --- | --- | --- | --- |
${ruleChanges
  .map(
    (change) =>
      `| ${change.rule} | ${change.canonicalName} | ${change.field} | ${change.from} | ${change.to} |`,
  )
  .join('\n')}`
}

## Globale Entscheidungen

**Olympic Weightlifting bleibt den Langhantelübungen vorbehalten.** Kettlebell
Clean, Snatch, Jerk und Clean & Jerk sind Kraftübungen und bleiben in
\`strength\`. \`olympic_weightlifting\` gilt für die olympischen Hebungen und ihre
klar erkennbaren Langhantel-Derivate.

**Die Katalogsprache ist Deutsch.** \`name\`, \`description\` und \`instructions\`
werden auf Deutsch ausgeliefert; \`canonicalName\` bleibt der englische Fachname.
Englische Quelltexte bleiben nicht als Anzeigetext stehen. Die deutsche Fassung
ist redaktionell verfasst und in \`provenance\` als solche vermerkt — die
Datenherkunft wrkout bleibt daneben bestehen.

**Lokalisierung ist eine offene Anforderung, keine Schemaänderung.** Ein
späterer DE/EN-Wechsel soll möglich bleiben; dafür werden **jetzt** keine
\`instructions_de\`/\`instructions_en\`-Felder eingeführt. Siehe
\`docs/domain/DOMAIN_DECISIONS.md\`.

**Varianten sind nicht freigegeben.** Die ${String(uniquePairs.length)} automatischen Vorschläge
enthalten nachweislich falsche Cluster — nicht jede Kniebeuge ist Variante jeder
anderen. Sie bleiben für eine eigene, fachliche Variantenreview erhalten und
gelten bis dahin als unbestätigt.

${
  removed.length === 0
    ? ''
    : `## Gestrichene Übungen

${String(removed.length)} Übungen verlassen den Katalog.

| Übung | Block | Grund |
| --- | --- | --- |
${removed.map((entry) => `| ${entry.name} | ${String(entry.block)} | ${entry.reason} |`).join('\n')}

`
}## Fachliche Entscheidungen

${String(reviewApplied.length)} Übungen geändert, in ${String(new Set(REVIEWED.map((decision) => decision.block)).size)} Block/Blöcken.

| Feld | Änderungen |
| --- | --- |
${Object.entries(changesByField)
  .sort((a, b) => b[1] - a[1])
  .map(([field, n]) => `| ${fieldLabels[field] ?? field} | ${String(n)} |`)
  .join('\n')}

${reviewApplied
  .map(
    (change) => `### ${change.canonicalName}

${change.note}

| Feld | vorher | nachher |
| --- | --- | --- |
${change.fields
  .map(
    (field) =>
      `| ${fieldLabels[field] ?? field} | ${show(change.before[field])} | ${show(change.after[field])} |`,
  )
  .join('\n')}`,
  )
  .join('\n\n')}

${
  reviewConflicts.length === 0
    ? ''
    : `## Offene fachliche Konflikte

Punkte, die die Review **nicht** entschieden hat. Nichts davon wurde geraten.

${reviewConflicts.map((entry) => `### ${entry.canonicalName}\n\n${entry.conflict}`).join('\n\n')}

`
}## Taxonomie

**Ein neuer Wert:** \`weight_belt\` im Equipment-Vokabular
(\`packages/domain/src/exercises/taxonomy.ts\`). Aufgenommen für die
Weighted Squat, deren Anleitung die Last an einem Gewichtsgürtel hängen lässt —
ohne den Wert konnte die Übung nicht sagen, was sie braucht. Keine Quelle führt
den Begriff, also bildet keine Mapping-Tabelle darauf ab: Der Wert wird
ausschließlich über eine geprüfte Entscheidung gesetzt. **Daraus wird keine
allgemeine Regel abgeleitet.**

Sonst keine neuen Werte. Alle gesetzten Werte für \`primaryMuscles\`,
\`secondaryMuscles\`, \`equipment\`, \`forceType\`, \`mechanic\` und \`difficulty\`
stammen aus den bestehenden kontrollierten Vokabularen.

Eine Korrektur außerhalb der Auswahl: In der Genustabelle stand
\`lat pulldown\` als Neutrum. *Der* Latzug ist maskulin — die Deklination bildete
die Endung also korrekt aus einem falschen Genus.
${
  reviewedButMissing.length > 0
    ? `\n## Ohne Treffer\n\nDiese Entscheidungen fanden keine Übung in der Auswahl:\n\n${reviewedButMissing
        .map((name) => `- ${name}`)
        .join('\n')}\n`
    : ''
}`;

writeFileSync(`${out}CHANGELOG.md`, changelog, 'utf8');

/**
 * Provenance on its own file, so the licence question can be answered without
 * reading the catalogue: which source every row came from, under what terms,
 * and which other sources corroborated it.
 */
write('provenance.json', {
  generatedOn: today,
  licences: {
    wrkout: 'Public Domain — the only source whose prose is taken.',
    exercemus: 'MIT, but partly curated from wger. Corroboration only.',
    wger: 'CC-BY-SA-4.0. Corroboration only; no text taken.',
    repdb: 'CC-BY-NC / commercial. Not used at all.',
  },
  bySource: count(selected, (entry) => entry.source),
  byLicense: count(selected, (entry) => entry.license),
  exercises: selected.map((entry) => ({
    key: entry.key,
    canonicalName: entry.canonicalName,
    germanName: entry.name,
    source: entry.source,
    sourceId: entry.sourceId,
    license: entry.license,
    corroboratedBy: entry.provenance.map((source) => source.source),
    provenance: entry.provenance,
  })),
});

const pct = (value: number, total: number) => `${String(Math.round((value / total) * 100))}%`;
const table = (tally: Record<string, number>) =>
  Object.entries(tally)
    .map(([key, n]) => `| ${key} | ${String(n)} | ${pct(n, selected.length)} |`)
    .join('\n');

writeFileSync(
  `${out}README.md`,
  `# Exercise catalogue — curation proposal

Generated ${today}. **Nothing here has been written to the database.**

## Method

The research pool of ${String(pool.length)} movements was reduced by rules, not by
hand-picking: every rule below was written once and applied to all of them, so
the result can be reviewed as a set of decisions rather than a list of opinions.

1. **Execution details are not exercises.** Grip widths, foot positions, tempos
   and named "variations" are cues and belong in \`instructions\`.
2. **Out-of-scope apparatus is dropped** — strongman implements, brand-specific
   machines, gymnastic rigs.
3. **Two categories are ours, and the sources do not carry them.** A movement
   held against gravity or resisting a direction becomes \`stability\`; a
   bodyweight movement of the calisthenics family becomes \`calisthenics\`.
4. **Breadth before depth.** Within a category, selection walks the movement
   patterns in turn, so no pattern is exhausted before another is reached.
5. **Anything uncertain is \`REVIEW\`, never guessed.**

## Sources and licences

| Source | Licence | Role |
| --- | --- | --- |
| wrkout / exercises.json | Public Domain | **Primary.** Prose and classification are taken from here. |
| wger | CC-BY-SA-4.0 | Reference only. Corroborates; its text is not taken. |
| Exercemus | MIT (provenance unsettled) | Reference only. |
| RepDB | CC-BY-NC / commercial | **Not used.** |

Instructions are taken only from wrkout: it is the one source whose terms let
its prose be shipped. That licence decision shows up as a data decision, which
is where it should show up.

Every selected exercise carries \`source\`, \`sourceId\` and \`license\`, plus the
full \`provenance\` of every source that corroborated it.

## German names

Composed from a term dictionary, not translated. A canonical name is decomposed
into equipment, modifiers and a base movement; each is looked up; the result is
assembled the way German writes compounds. A base movement the dictionary does
not know marks the candidate \`REVIEW\` with the term named — the difference
between a proposal worth reviewing and plausible invention.

## Coverage

Selected: **${String(selected.length)}**

### By category

| Category | Selected | Target |
| --- | --- | --- |
${Object.entries(TARGETS)
  .map(
    ([key, target]) =>
      `| ${key} | ${String(coverageReport.byCategory[key] ?? 0)} | ${String(target)} |`,
  )
  .join('\n')}

### By movement pattern

| Pattern | Count | Share |
| --- | --- | --- |
${table(coverageReport.byMovementPattern)}

### By primary muscle

| Muscle | Count | Share |
| --- | --- | --- |
${table(coverageReport.byPrimaryMuscle)}

### By equipment

| Equipment | Count | Share |
| --- | --- | --- |
${table(coverageReport.byEquipment)}

### By difficulty, force and mechanic

| Difficulty | Count |
| --- | --- |
${Object.entries(coverageReport.byDifficulty)
  .map(([k, n]) => `| ${k} | ${String(n)} |`)
  .join('\n')}

| Force | Count |
| --- | --- |
${Object.entries(coverageReport.byForceType)
  .map(([k, n]) => `| ${k} | ${String(n)} |`)
  .join('\n')}

| Mechanic | Count |
| --- | --- |
${Object.entries(coverageReport.byMechanic)
  .map(([k, n]) => `| ${k} | ${String(n)} |`)
  .join('\n')}

Unilateral: ${String(coverageReport.unilateral.yes)} · bilateral: ${String(coverageReport.unilateral.no)}

## Variants

${String(uniquePairs.length)} pairs proposed, only between selected exercises that share a
recognised movement family and differ in equipment or angle. Never from name
similarity alone. **Not written to \`exercise_variants\`.**

## Exclusions

${String(excluded.length)} candidates excluded. Reasons, most common first:

${Object.entries(count(excluded, (entry) => entry.reason))
  .slice(0, 10)
  .map(([reason, n]) => `- ${String(n)}× ${reason}`)
  .join('\n')}

## Review

${String(needsReview.length)} candidates need a decision before they could be imported, and
${String(notSelected.length)} clean candidates were not selected — available if a category
should be widened.

## Quality checks

${
  problems.length === 0
    ? 'All checks passed.'
    : problems
        .slice(0, 20)
        .map((problem) => `- ${problem}`)
        .join('\n')
}
`,
  'utf8',
);

const line = (label: string, value: string) => console.info(`  ${label.padEnd(32)} ${value}`);

console.info('');
console.info('══ Curation ══');
line('pool', String(pool.length));
line('excluded', String(excluded.length));
line('need review', String(needsReview.length));
line('clean', String(clean.length));
line('selected', String(selected.length));
line('clean but not selected', String(notSelected.length));
line('variant proposals', String(uniquePairs.length));
line('of which editorial', String(editorialAdded.length));
line('editorial name conflicts', String(editorialConflicts.length));

console.info('');
console.info('══ By category (selected / target) ══');
for (const [category, target] of Object.entries(TARGETS)) {
  line(category, `${String(coverageReport.byCategory[category] ?? 0)} / ${String(target)}`);
}

console.info('');
console.info(
  `══ Quality: ${problems.length === 0 ? 'clean' : `${String(problems.length)} problems`} ══`,
);
for (const problem of problems.slice(0, 8)) line('', problem);

console.info('');
console.info(`Written: ${out.slice(out.indexOf('artifacts'))}`);
console.info('Nothing was written to the database.');
