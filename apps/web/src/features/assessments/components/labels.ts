/**
 * German wording for the assessment screens.
 *
 * The same shape as `features/exercises/components/labels.ts`: the vocabularies
 * live in `@apex/domain` as keys, and the words a coach reads live here, in the
 * application. Two reasons that split is worth keeping.
 *
 * `MODULE_LABELS` and its siblings in the domain package say they are the names
 * "exactly as the domain documents write them" — and those documents are in
 * English. They are a mirror of the specification, not user-facing copy;
 * translating them there would make the comment untrue and would change a value
 * that a future report generator or export might legitimately want in English.
 *
 * ## Terminology, kept apart on purpose
 *
 * The brief for this slice is explicit that these are different things, and the
 * German words were chosen so they cannot blur into each other:
 *
 * - **Assessment** — the examination as a whole. Kept as-is: it is the term the
 *   domain uses, it is current in German sports science, and "Untersuchung"
 *   would collide with the medical sense.
 * - **Test** — one module inside an assessment. Never "Modul": that is the code's
 *   word for the row, not the coach's word for the thing performed.
 * - **Messwert** — a single recorded value. **Messgröße** — the quantity it is a
 *   value of. English blurs both into "measurement".
 * - **Stufe** — one pass of a multi-stage protocol.
 * - **Auswertbarkeit** — whether the data supports an evaluation. Deliberately
 *   not "Auswertung", which is the evaluation itself and does not exist yet.
 */

import type { AssessmentModuleStatus, MeasurementRole, ModuleKey } from '@apex/domain';

/** What a test is called. */
export const MODULE_LABELS_DE: Readonly<Record<ModuleKey, string>> = {
  running: 'Laufen',
  strength: 'Kraft',
  movement: 'Bewegung',
  mobility: 'Mobilität',
  lactate: 'Laktat',
  body_composition: 'Körperzusammensetzung',
  nutrition: 'Ernährung',
  recovery: 'Regeneration',
  sleep: 'Schlaf',
  cycle: 'Zyklus',
  custom: 'Eigener Test',
};

/**
 * How far the coach got — not how good the data is. That is `READINESS_LABELS`.
 *
 * "Läuft" rather than "In Bearbeitung": it is shorter, which matters in a badge
 * beside a second badge on a 375px screen, and it is what a coach would say.
 */
export const MODULE_STATUS_LABELS_DE: Readonly<Record<AssessmentModuleStatus, string>> = {
  PLANNED: 'Geplant',
  IN_PROGRESS: 'Läuft',
  COMPLETED: 'Abgeschlossen',
  SKIPPED: 'Übersprungen',
  ABORTED: 'Abgebrochen',
};

/** What a quantity is worth within a test. */
export const MEASUREMENT_ROLE_LABELS_DE: Readonly<Record<MeasurementRole, string>> = {
  required: 'Pflicht',
  recommended: 'Empfohlen',
  optional: 'Optional',
};

/**
 * What the data supports, as the domain service computed it.
 *
 * A completed test may still read "Teilweise auswertbar", and that is the point:
 * status is how far the coach got, readiness is what the values allow.
 */
export const READINESS_LABELS_DE: Readonly<Record<string, string>> = {
  COMPLETE: 'Vollständig auswertbar',
  PARTIAL: 'Teilweise auswertbar',
  INSUFFICIENT: 'Nicht auswertbar',
};

/** The kind of examination. */
export const ASSESSMENT_TYPE_LABELS_DE: Readonly<Record<string, string>> = {
  INITIAL: 'Erstassessment',
  RE_ASSESSMENT: 'Re-Assessment',
  FOLLOW_UP: 'Verlaufskontrolle',
};

/** Which side a value was taken on. */
export const SIDE_LABELS_DE: Readonly<Record<string, string>> = {
  LEFT: 'Links',
  RIGHT: 'Rechts',
  BILATERAL: 'Beidseitig',
};

/**
 * Where an examination stands.
 *
 * "Läuft" matches the test's wording one level down — the same word for the
 * same state, so a coach learns it once.
 */
export const ASSESSMENT_STATUS_LABELS_DE: Readonly<Record<string, string>> = {
  PLANNED: 'Geplant',
  IN_PROGRESS: 'Läuft',
  COMPLETED: 'Abgeschlossen',
  ABORTED: 'Abgebrochen',
  ARCHIVED: 'Archiviert',
};

/**
 * What a test is called — its own name, or its type when it has none.
 *
 * Lives here rather than beside a screen because a Server Component needs it
 * too: it used to sit in a `'use client'` module, and the test overview crashed
 * with "Attempted to call moduleLabel() from the server". A label helper has no
 * business being client-only.
 */
export function moduleLabel(entry: { name: string | null; moduleKey: string }): string {
  if (entry.name !== null && entry.name !== '') return entry.name;

  return MODULE_LABELS_DE[entry.moduleKey as ModuleKey] ?? entry.moduleKey;
}
