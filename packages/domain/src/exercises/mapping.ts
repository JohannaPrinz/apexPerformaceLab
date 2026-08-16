import {
  difficultyVocabulary,
  equipmentVocabulary,
  exerciseCategoryVocabulary,
  forceTypeVocabulary,
  isInVocabulary,
  mechanicVocabulary,
  muscleVocabulary,
  type Vocabulary,
} from './taxonomy';

/**
 * Translating a source's words into ours.
 *
 * **No source's taxonomy reaches the database.** Every external value passes
 * through a table here first, and a value with no entry is *reported*, never
 * guessed and never silently dropped. That is the whole point: two datasets
 * that disagree with each other cannot both be right, and the way to keep our
 * catalogue coherent is to decide once, in a file someone can read.
 *
 * ## Three outcomes, all of them explicit
 *
 * - **mapped** — the external value has a counterpart in our vocabulary
 * - **dropped** — it is deliberately not represented, with a reason. wger's
 *   `none` equipment is bodyweight, which we say with an empty list; Exercemus's
 *   `other` classifies nothing; its `cardio` "muscle" is not a muscle.
 * - **unmapped** — nobody has decided yet. The importer surfaces these rather
 *   than writing an exercise that quietly lost half its classification.
 *
 * A dropped value and an unmapped one look the same in the database and could
 * not be more different in review, which is why they are separate outcomes.
 */

export type MappingOutcome =
  | { readonly kind: 'mapped'; readonly value: string }
  | { readonly kind: 'dropped'; readonly reason: string }
  | { readonly kind: 'unmapped' };

type Table = Readonly<Record<string, string | { drop: string }>>;

/**
 * Normalises an external value before lookup.
 *
 * Sources are inconsistent about case, spaces, hyphens and slashes — `SZ-Bar`,
 * `ez curl bar` and `EZ Curl Bar` are one thing. Normalising here means the
 * tables below hold one entry per concept instead of one per spelling.
 */
export function normaliseExternal(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ── Muscles ──────────────────────────────────────────────────────────────────

/**
 * wger names muscles in Latin, with an English alias on some. Both spellings
 * are accepted, because which one an export carries depends on the endpoint.
 */
const WGER_MUSCLES: Table = {
  pectoralis_major: 'chest',
  chest: 'chest',
  serratus_anterior: 'serratus_anterior',
  rectus_abdominis: 'abs',
  abs: 'abs',
  obliquus_externus_abdominis: 'obliques',
  latissimus_dorsi: 'lats',
  lats: 'lats',
  trapezius: 'traps',
  anterior_deltoid: 'shoulders',
  shoulders: 'shoulders',
  biceps_brachii: 'biceps',
  biceps: 'biceps',
  brachialis: 'brachialis',
  triceps_brachii: 'triceps',
  triceps: 'triceps',
  gluteus_maximus: 'glutes',
  glutes: 'glutes',
  quadriceps_femoris: 'quads',
  quads: 'quads',
  biceps_femoris: 'hamstrings',
  hamstrings: 'hamstrings',
  gastrocnemius: 'calves',
  calves: 'calves',
  soleus: 'soleus',
};

const EXERCEMUS_MUSCLES: Table = {
  chest: 'chest',
  abs: 'abs',
  obliques: 'obliques',
  lats: 'lats',
  middle_back: 'upper_back',
  traps: 'traps',
  lower_back: 'lower_back',
  neck: {
    drop: 'Not a muscle either source classifies consistently, and no movement in scope targets it.',
  },
  shoulders: 'shoulders',
  biceps: 'biceps',
  brachialis: 'brachialis',
  triceps: 'triceps',
  forearms: 'forearms',
  glutes: 'glutes',
  quads: 'quads',
  hamstrings: 'hamstrings',
  adductors: 'adductors',
  abductors: 'abductors',
  calves: 'calves',
  soleus: 'soleus',
  // Deliberately not adopted.
  back: {
    drop: 'A region, not a muscle. The three back muscles we carry — lats, upper back, lower back — say it more precisely.',
  },
  cardio: {
    drop: 'Not a muscle. It describes the training effect, which is what `category` is for.',
  },
};

// ── Equipment ────────────────────────────────────────────────────────────────

const WGER_EQUIPMENT: Table = {
  barbell: 'barbell',
  sz_bar: 'ez_curl_bar',
  dumbbell: 'dumbbell',
  kettlebell: 'kettlebell',
  cable_machine: 'cable',
  resistance_band: 'resistance_band',
  pull_up_bar: 'pull_up_bar',
  bench: 'bench',
  incline_bench: 'incline_bench',
  gym_mat: 'gym_mat',
  swiss_ball: 'exercise_ball',
  none_bodyweight_exercise: {
    drop: 'Bodyweight is the empty list. A value meaning "no value" would make every later filter carry a special case.',
  },
};

const EXERCEMUS_EQUIPMENT: Table = {
  barbell: 'barbell',
  ez_curl_bar: 'ez_curl_bar',
  dumbbell: 'dumbbell',
  kettlebell: 'kettlebell',
  machine: 'machine',
  cable: 'cable',
  bands: 'resistance_band',
  pull_up_bar: 'pull_up_bar',
  bench: 'bench',
  incline_bench: 'incline_bench',
  gym_mat: 'gym_mat',
  exercise_ball: 'exercise_ball',
  medicine_ball: 'medicine_ball',
  foam_roll: 'foam_roller',
  none: {
    drop: 'Bodyweight is the empty list.',
  },
  other: {
    drop: 'Classifies nothing. An exercise is better left unclassified than filed under a label a coach cannot search.',
  },
};

// ── Categories ───────────────────────────────────────────────────────────────

/**
 * wger's categories are **body regions**, not training types.
 *
 * They therefore do not map onto our `category` at all. They are dropped here
 * and — where the importer is given them — read as a muscle hint instead, which
 * is the axis they actually describe.
 */
const WGER_CATEGORIES: Table = {
  abs: { drop: 'A body region. wger classifies by region; our category is the training type.' },
  arms: { drop: 'A body region.' },
  back: { drop: 'A body region.' },
  calves: { drop: 'A body region.' },
  chest: { drop: 'A body region.' },
  legs: { drop: 'A body region.' },
  shoulders: { drop: 'A body region.' },
  cardio: 'endurance',
};

const EXERCEMUS_CATEGORIES: Table = {
  strength: 'strength',
  cardio: 'endurance',
  stretching: 'mobility',
  plyometrics: 'plyometrics',
  olympic_weightlifting: 'olympic_weightlifting',
  calisthenics: 'calisthenics',
  // Brand and competition names, kept out for the same reason HYROX is not a
  // module (§11). The movements themselves map on their merits.
  crossfit: {
    drop: 'A brand. Its movements are strength, plyometrics or olympic weightlifting and are classified as such.',
  },
  strongman: {
    drop: 'A competition format, not a training type. Its movements are strength.',
  },
};

/**
 * wrkout / exercises.json — the public-domain dataset.
 *
 * Its spellings differ from both other sources in ways that matter: plural
 * `kettlebells`, anatomical `abdominals` and `quadriceps` where Exercemus uses
 * the gym words, and `body only` where wger says `none (bodyweight exercise)`.
 * All three describe the same thing; only one of them can be in our column.
 */
const WRKOUT_MUSCLES: Table = {
  abdominals: 'abs',
  quadriceps: 'quads',
  hamstrings: 'hamstrings',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  shoulders: 'shoulders',
  chest: 'chest',
  lats: 'lats',
  middle_back: 'upper_back',
  lower_back: 'lower_back',
  traps: 'traps',
  glutes: 'glutes',
  adductors: 'adductors',
  abductors: 'abductors',
  calves: 'calves',
  neck: {
    drop: 'Not a muscle our vocabulary carries, and no movement in scope targets it.',
  },
  cardio: {
    drop: 'Not a muscle. It describes the training effect, which is what `category` is for.',
  },
};

const WRKOUT_EQUIPMENT: Table = {
  barbell: 'barbell',
  e_z_curl_bar: 'ez_curl_bar',
  dumbbell: 'dumbbell',
  kettlebells: 'kettlebell',
  machine: 'machine',
  cable: 'cable',
  bands: 'resistance_band',
  foam_roll: 'foam_roller',
  medicine_ball: 'medicine_ball',
  exercise_ball: 'exercise_ball',
  body_only: {
    drop: 'Bodyweight is the empty list.',
  },
  other: {
    drop: 'Classifies nothing.',
  },
};

const WRKOUT_CATEGORIES: Table = {
  strength: 'strength',
  stretching: 'mobility',
  plyometrics: 'plyometrics',
  cardio: 'endurance',
  olympic_weightlifting: 'olympic_weightlifting',
  // Sports, not training types — the same rule that keeps HYROX out of the
  // module registry (§11). Their movements are strength and classify as such.
  powerlifting: {
    drop: 'A sport, not a training type. Its three lifts are strength movements.',
  },
  strongman: {
    drop: 'A competition format, not a training type. Its movements are strength.',
  },
};

/**
 * The three axes only wrkout carries.
 *
 * Our `forceType` and `mechanic` use the same words it does, so those pass
 * through. `difficulty` does not: wrkout's third level is `expert`, ours is
 * `advanced`. One word, and it would have silently unclassified every hard
 * movement in the catalogue.
 */
const WRKOUT_DIFFICULTY: Table = {
  beginner: 'beginner',
  intermediate: 'intermediate',
  expert: 'advanced',
};

const WRKOUT_FORCE_TYPES: Table = {
  push: 'push',
  pull: 'pull',
  static: 'static',
};

const WRKOUT_MECHANICS: Table = {
  compound: 'compound',
  isolation: 'isolation',
};

const EMPTY: Table = {};

const TABLES = {
  wger: {
    muscle: WGER_MUSCLES,
    equipment: WGER_EQUIPMENT,
    category: WGER_CATEGORIES,
    forceType: EMPTY,
    mechanic: EMPTY,
    difficulty: EMPTY,
  },
  exercemus: {
    muscle: EXERCEMUS_MUSCLES,
    equipment: EXERCEMUS_EQUIPMENT,
    category: EXERCEMUS_CATEGORIES,
    forceType: EMPTY,
    mechanic: EMPTY,
    difficulty: EMPTY,
  },
  wrkout: {
    muscle: WRKOUT_MUSCLES,
    equipment: WRKOUT_EQUIPMENT,
    category: WRKOUT_CATEGORIES,
    forceType: WRKOUT_FORCE_TYPES,
    mechanic: WRKOUT_MECHANICS,
    difficulty: WRKOUT_DIFFICULTY,
  },
} as const;

export type MappedVocabulary =
  'muscle' | 'equipment' | 'category' | 'forceType' | 'mechanic' | 'difficulty';

const VOCABULARIES: Readonly<Record<MappedVocabulary, Vocabulary>> = {
  muscle: muscleVocabulary,
  equipment: equipmentVocabulary,
  category: exerciseCategoryVocabulary,
  forceType: forceTypeVocabulary,
  mechanic: mechanicVocabulary,
  difficulty: difficultyVocabulary,
};

/**
 * Translates one external value.
 *
 * A value that is *already* one of ours passes through — a hand-written import
 * file should not have to be written in a source's dialect to be accepted.
 */
export function mapExternalValue(
  source: string,
  vocabulary: MappedVocabulary,
  external: string,
): MappingOutcome {
  const normalised = normaliseExternal(external);

  if (isInVocabulary(VOCABULARIES[vocabulary], normalised)) {
    return { kind: 'mapped', value: normalised };
  }

  const table = (TABLES as Record<string, Record<MappedVocabulary, Table>>)[source]?.[vocabulary];
  const entry = table?.[normalised];

  if (entry === undefined) return { kind: 'unmapped' };
  if (typeof entry === 'string') return { kind: 'mapped', value: entry };

  return { kind: 'dropped', reason: entry.drop };
}

export interface MappedList {
  readonly values: readonly string[];
  readonly dropped: readonly { readonly external: string; readonly reason: string }[];
  readonly unmapped: readonly string[];
}

/**
 * Translates a list, keeping order and removing duplicates.
 *
 * Two external values mapping onto one of ours is expected — wger's
 * `Anterior deltoid` and Exercemus's `shoulders` both become `shoulders` — and
 * the result must not list it twice.
 */
export function mapExternalList(
  source: string,
  vocabulary: MappedVocabulary,
  externals: readonly string[],
): MappedList {
  const values: string[] = [];
  const dropped: { external: string; reason: string }[] = [];
  const unmapped: string[] = [];

  for (const external of externals) {
    const outcome = mapExternalValue(source, vocabulary, external);

    if (outcome.kind === 'mapped') {
      if (!values.includes(outcome.value)) values.push(outcome.value);
    } else if (outcome.kind === 'dropped') {
      dropped.push({ external, reason: outcome.reason });
    } else {
      unmapped.push(external);
    }
  }

  return { values, dropped, unmapped };
}

/** Every external value a source knows how to translate — for review and tests. */
export function mappingTable(
  source: string,
  vocabulary: MappedVocabulary,
): readonly { readonly external: string; readonly internal: string | null }[] {
  const table = (TABLES as Record<string, Record<MappedVocabulary, Table>>)[source]?.[vocabulary];
  if (!table) return [];

  return Object.entries(table).map(([external, entry]) => ({
    external,
    internal: typeof entry === 'string' ? entry : null,
  }));
}
