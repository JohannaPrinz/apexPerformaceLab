import {
  EQUIPMENT,
  EXERCISE_CATEGORIES,
  EXERCISE_DIFFICULTIES,
  EXERCISE_FORCE_TYPES,
  EXERCISE_MECHANICS,
  MUSCLES,
} from '@apex/domain';

/**
 * German words for the controlled vocabularies.
 *
 * Display only — the stored value stays the English key, so a label change is
 * never a data migration. Shared by the filter bar and the result rows on
 * purpose: two dictionaries for the same vocabulary drift, and then a coach
 * filters for "Kraft" and reads "Strength" in the results.
 */

/** German labels for the controlled vocabularies. Display only, never stored. */
export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  strength: 'Kraft',
  endurance: 'Ausdauer',
  mobility: 'Mobilität',
  stability: 'Stabilität',
  plyometrics: 'Plyometrie',
  olympic_weightlifting: 'Olympisches Heben',
  calisthenics: 'Calisthenics',
};

export const DIFFICULTY_LABELS: Readonly<Record<string, string>> = {
  beginner: 'Einsteiger',
  intermediate: 'Fortgeschritten',
  advanced: 'Profi',
};

export const EQUIPMENT_LABELS: Readonly<Record<string, string>> = {
  barbell: 'Langhantel',
  ez_curl_bar: 'SZ-Stange',
  dumbbell: 'Kurzhantel',
  kettlebell: 'Kettlebell',
  machine: 'Maschine',
  cable: 'Kabelzug',
  resistance_band: 'Band',
  pull_up_bar: 'Klimmzugstange',
  bench: 'Bank',
  incline_bench: 'Schrägbank',
  gym_mat: 'Matte',
  exercise_ball: 'Gymnastikball',
  medicine_ball: 'Medizinball',
  foam_roller: 'Faszienrolle',
  weight_belt: 'Gewichtsgürtel',
  weight_plate: 'Hantelscheibe',
  gymnastic_rings: 'Ringe',
  suspension_trainer: 'Schlingentrainer',
  jump_rope: 'Springseil',
  battle_rope: 'Battle Rope',
};

export const MUSCLE_LABELS: Readonly<Record<string, string>> = {
  chest: 'Brust',
  serratus_anterior: 'Serratus',
  abs: 'Bauch',
  obliques: 'Schräge Bauchmuskulatur',
  lats: 'Latissimus',
  upper_back: 'Oberer Rücken',
  traps: 'Trapez',
  lower_back: 'Unterer Rücken',
  shoulders: 'Schultern',
  biceps: 'Bizeps',
  brachialis: 'Brachialis',
  triceps: 'Trizeps',
  forearms: 'Unterarme',
  glutes: 'Gesäß',
  quads: 'Oberschenkelvorderseite',
  hamstrings: 'Beinrückseite',
  adductors: 'Adduktoren',
  abductors: 'Abduktoren',
  calves: 'Waden',
  soleus: 'Schollenmuskel',
};

export const FORCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  push: 'Drücken',
  pull: 'Ziehen',
  static: 'Statisch',
  dynamic: 'Dynamisch',
};

export const MECHANIC_LABELS: Readonly<Record<string, string>> = {
  compound: 'Mehrgelenkig',
  isolation: 'Eingelenkig',
};

/** Falls back to the key, so an unlabelled value is visible rather than blank. */
export const label = (dictionary: Readonly<Record<string, string>>, value: string): string =>
  dictionary[value] ?? value;

/** Vocabulary plus label, in the order a select should offer them. */
export const options = (
  values: readonly string[],
  dictionary: Readonly<Record<string, string>>,
): readonly { readonly value: string; readonly label: string }[] =>
  [...values]
    .map((value) => ({ value, label: label(dictionary, value) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));

export const CATEGORY_OPTIONS = options(EXERCISE_CATEGORIES, CATEGORY_LABELS);
export const DIFFICULTY_OPTIONS = EXERCISE_DIFFICULTIES.map((value) => ({
  value,
  label: label(DIFFICULTY_LABELS, value),
}));
export const MUSCLE_OPTIONS = options(MUSCLES, MUSCLE_LABELS);
export const EQUIPMENT_OPTIONS = options(EQUIPMENT, EQUIPMENT_LABELS);
export const FORCE_TYPE_OPTIONS = options(EXERCISE_FORCE_TYPES, FORCE_TYPE_LABELS);
export const MECHANIC_OPTIONS = options(EXERCISE_MECHANICS, MECHANIC_LABELS);

/**
 * Where an exercise comes from.
 *
 * "Katalog" rather than "System": a coach does not think of the shared
 * catalogue as a system, and `SYSTEM` is an implementation word. "Eigene" is
 * the workspace's own — which, once a workspace holds several coaches, means
 * the practice's, not one person's. That is the same distinction
 * `Exercise.organizationId` already draws; nothing new is introduced.
 *
 * The `all` value is deliberately absent: it is the placeholder of an empty
 * select, exactly like every other filter in this bar.
 */
export const ORIGIN_LABELS: Readonly<Record<string, string>> = {
  system: 'Katalog',
  workspace: 'Eigene',
};

export const ORIGIN_OPTIONS = [
  { value: 'system', label: ORIGIN_LABELS['system'] ?? 'Katalog' },
  { value: 'workspace', label: ORIGIN_LABELS['workspace'] ?? 'Eigene' },
] as const;
