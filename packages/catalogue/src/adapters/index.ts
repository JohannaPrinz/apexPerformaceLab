import { cleanList, cleanText, type NeutralDataset, type NeutralExercise } from '../neutral';

/**
 * Reading each dataset into the neutral shape.
 *
 * An adapter's only job is **translation of structure, never of meaning**. It
 * moves `primary_muscles` to `primaryMuscles` and lifts a single string into a
 * list where a source uses one; it does not rename `abdominals` to `abs`, does
 * not decide that `body only` means no equipment, and does not drop a value it
 * finds odd. Every such judgement belongs in the comparison, where it is
 * visible and reversible.
 *
 * A record an adapter cannot read is **reported**, not skipped. A dataset that
 * silently loses fifty rows would make every count below a lie.
 */

export type Adapter = (
  raw: unknown,
  meta: { fetchedOn: string; url: string; license: string },
) => NeutralDataset;

/**
 * A source id as a string, whatever the source stored it as.
 *
 * wger numbers its ids, the other two use strings. Narrowed rather than passed
 * to `String()`: an unexpected object would stringify to `[object Object]` and
 * become an id that matches nothing and looks fine.
 */
function idText(value: unknown): string | undefined {
  if (typeof value === 'string') return cleanText(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);

  return undefined;
}

function dataset(
  source: string,
  meta: { fetchedOn: string; url: string; license: string },
  exercises: readonly NeutralExercise[],
  unreadable: readonly { index: number; reason: string }[],
): NeutralDataset {
  return {
    source,
    license: meta.license,
    fetchedOn: meta.fetchedOn,
    url: meta.url,
    exercises,
    unreadable,
  };
}

/**
 * wrkout / exercises.json.
 *
 * Fields: `id`, `name`, `force`, `level`, `mechanic`, `equipment`,
 * `primaryMuscles`, `secondaryMuscles`, `instructions`, `category`, `images`.
 *
 * Two shape quirks worth naming: `equipment` is a **single string**, not a
 * list — so a movement needing a bench *and* a barbell cannot be expressed —
 * and there is no variant field at all.
 */
export const wrkoutAdapter: Adapter = (raw, meta) => {
  const rows = Array.isArray(raw) ? raw : [];
  const exercises: NeutralExercise[] = [];
  const unreadable: { index: number; reason: string }[] = [];

  rows.forEach((row: unknown, index) => {
    if (typeof row !== 'object' || row === null) {
      unreadable.push({ index, reason: 'Not an object.' });

      return;
    }

    const record = row as Record<string, unknown>;
    const name = cleanText(record['name']);
    const id = idText(record['id']) ?? name;

    if (!name || !id) {
      unreadable.push({ index, reason: 'No name, so nothing can identify it.' });

      return;
    }

    exercises.push({
      source: 'wrkout',
      sourceId: id,
      license: meta.license,
      name,
      description: undefined,
      instructions: cleanList(record['instructions'] as unknown[]),
      primaryMuscles: cleanList(record['primaryMuscles'] as unknown[]),
      secondaryMuscles: cleanList(record['secondaryMuscles'] as unknown[]),
      // A single string in this dataset. Lifted into a list so every source has
      // one shape — the *limitation* is recorded in the comparison, not hidden.
      equipment: cleanList([record['equipment']]),
      category: cleanText(record['category']),
      forceType: cleanText(record['force']),
      mechanic: cleanText(record['mechanic']),
      difficulty: cleanText(record['level']),
      variantsOf: [],
      media: cleanList(record['images'] as unknown[]),
      raw: record,
    });
  });

  return dataset('wrkout', meta, exercises, unreadable);
};

/**
 * Exercemus.
 *
 * Fields: `name`, `category`, `description`, `equipment`, `instructions`,
 * `primary_muscles`, `secondary_muscles`, `variations_on`, `video`.
 *
 * The only source carrying variant relations. It has no id of its own, so the
 * name is the anchor — which is itself a finding: two rows sharing a name
 * cannot be told apart on a re-read.
 */
export const exercemusAdapter: Adapter = (raw, meta) => {
  const container = raw as Record<string, unknown> | unknown[];
  const rows = Array.isArray(container)
    ? container
    : Array.isArray(container['exercises'])
      ? (container['exercises'] as unknown[])
      : [];

  const exercises: NeutralExercise[] = [];
  const unreadable: { index: number; reason: string }[] = [];

  rows.forEach((row: unknown, index) => {
    if (typeof row !== 'object' || row === null) {
      unreadable.push({ index, reason: 'Not an object.' });

      return;
    }

    const record = row as Record<string, unknown>;
    const name = cleanText(record['name']);

    if (!name) {
      unreadable.push({ index, reason: 'No name, and this source has no id to fall back on.' });

      return;
    }

    exercises.push({
      source: 'exercemus',
      sourceId: name,
      license: meta.license,
      name,
      description: cleanText(record['description']),
      instructions: cleanList(record['instructions'] as unknown[]),
      primaryMuscles: cleanList(record['primary_muscles'] as unknown[]),
      secondaryMuscles: cleanList(record['secondary_muscles'] as unknown[]),
      equipment: cleanList(record['equipment'] as unknown[]),
      category: cleanText(record['category']),
      forceType: undefined,
      mechanic: undefined,
      difficulty: undefined,
      variantsOf: cleanList(record['variations_on'] as unknown[]),
      media: cleanList([record['video']]),
      raw: record,
    });
  });

  return dataset('exercemus', meta, exercises, unreadable);
};

/**
 * wger.
 *
 * Its API nests everything: translations carry the name and description per
 * language, muscles and equipment are objects, and the category is one object.
 * The German translation is preferred where present — this is the one source
 * that ships German names, and comparing them against the ones we choose is
 * part of the point.
 */
export const wgerAdapter: Adapter = (raw, meta) => {
  const container = raw as Record<string, unknown>;
  const rows = Array.isArray(container['results'])
    ? (container['results'] as unknown[])
    : Array.isArray(raw)
      ? (raw as unknown[])
      : [];

  const exercises: NeutralExercise[] = [];
  const unreadable: { index: number; reason: string }[] = [];

  rows.forEach((row: unknown, index) => {
    if (typeof row !== 'object' || row === null) {
      unreadable.push({ index, reason: 'Not an object.' });

      return;
    }

    const record = row as Record<string, unknown>;
    const translations = Array.isArray(record['translations'])
      ? (record['translations'] as Record<string, unknown>[])
      : [];

    // 2 is English, 1 is German in wger's language table. English is the
    // anchor because every row has it; German is kept in `raw` for comparison.
    const english = translations.find((entry) => entry['language'] === 2) ?? translations[0];
    const name = cleanText(english?.['name']);
    const id = idText(record['id']);

    if (!name || !id) {
      unreadable.push({ index, reason: 'No English translation and no id.' });

      return;
    }

    const named = (values: unknown): readonly string[] =>
      cleanList(
        (Array.isArray(values) ? values : []).map((entry) =>
          typeof entry === 'object' && entry !== null
            ? cleanText((entry as Record<string, unknown>)['name'])
            : undefined,
        ),
      );

    const category = record['category'];

    exercises.push({
      source: 'wger',
      sourceId: id,
      license: meta.license,
      name,
      description: cleanText(english?.['description']),
      instructions: [],
      primaryMuscles: named(record['muscles']),
      secondaryMuscles: named(record['muscles_secondary']),
      equipment: named(record['equipment']),
      category:
        typeof category === 'object' && category !== null
          ? cleanText((category as Record<string, unknown>)['name'])
          : cleanText(category),
      forceType: undefined,
      mechanic: undefined,
      difficulty: undefined,
      // wger has a `variations` group id rather than named relations; kept raw
      // so the comparison can report what it does and does not express.
      // wger groups variations by a shared numeric id rather than naming them.
      // Kept as that id so the comparison can report what the source does and
      // does not express, rather than inventing a relation it never stated.
      variantsOf: cleanList([idText(record['variations'])]),
      media: cleanList(
        (Array.isArray(record['images'])
          ? (record['images'] as Record<string, unknown>[])
          : []
        ).map((image) => cleanText(image['image'])),
      ),
      raw: record,
    });
  });

  return dataset('wger', meta, exercises, unreadable);
};

export const ADAPTERS: Readonly<Record<string, Adapter>> = {
  wrkout: wrkoutAdapter,
  exercemus: exercemusAdapter,
  wger: wgerAdapter,
};
