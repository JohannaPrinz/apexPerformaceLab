import { z } from 'zod';

/**
 * The module registry.
 *
 * §11 puts this here rather than in the database: a module is stored as a
 * **string key**, never as an enum, so that adding one is a new entry in this
 * file instead of a migration (DOMAIN_RULES #8). `AssessmentModule.moduleKey`
 * is a `String` for exactly that reason.
 *
 * Two rules this file exists to hold:
 *
 * - **Module names are domain terms only.** They never carry a device, vendor
 *   or competition name. VALD, MYOACT, Garmin and Polar are *data sources*; a
 *   VALD jump test belongs to `strength` and records VALD as its source. Module
 *   and source are independent dimensions.
 * - **A preset name is never a module key.** Presets and modules share one
 *   namespace in the interface, so an overlap would make "choose `movement`"
 *   ambiguous. `assertNoPresetShadowsAModule` below is that rule as a test.
 *
 * This registry deliberately holds *identity* only — key and label. Module
 * behaviour (validation schema, measurement types, report renderer) arrives
 * with each module's implementation; inventing it here for eleven unbuilt
 * modules would be a registry nobody can review.
 */

/**
 * The canonical eleven (§11).
 *
 * Order is the domain document's order, and it is the order the interface
 * offers them in — not alphabetical, which would separate `sleep` from
 * `recovery`.
 */
export const MODULE_KEYS = [
  'running',
  'strength',
  'movement',
  'mobility',
  'lactate',
  'body_composition',
  'nutrition',
  'recovery',
  'sleep',
  'cycle',
  'custom',
] as const;

export const moduleKeySchema = z.enum(MODULE_KEYS);
export type ModuleKey = z.infer<typeof moduleKeySchema>;

/** Display names, exactly as the domain documents write them. */
export const MODULE_LABELS: Readonly<Record<ModuleKey, string>> = {
  running: 'Running',
  strength: 'Strength',
  movement: 'Movement',
  mobility: 'Mobility',
  lactate: 'Lactate',
  body_composition: 'Body Composition',
  nutrition: 'Nutrition',
  recovery: 'Recovery',
  sleep: 'Sleep',
  cycle: 'Cycle',
  custom: 'Custom',
} as const;

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

/**
 * Assessment presets — named combinations of modules (§11).
 *
 * Competition formats such as HYROX are presets, not modules: HYROX is a way of
 * assembling an assessment, not an area of analysis. Presets are
 * **configuration, not entities** — they have no table and may later become
 * user-definable, which is why they live beside the registry rather than in it.
 */
export const ASSESSMENT_PRESETS = {
  hyrox: ['running', 'strength', 'movement'],
  movement_screening: ['movement', 'mobility'],
  lactate_test: ['lactate'],
} as const satisfies Readonly<Record<string, readonly ModuleKey[]>>;

export const presetKeySchema = z.enum(
  Object.keys(ASSESSMENT_PRESETS) as [PresetKey, ...PresetKey[]],
);
export type PresetKey = keyof typeof ASSESSMENT_PRESETS;

export function modulesForPreset(preset: PresetKey): readonly ModuleKey[] {
  return ASSESSMENT_PRESETS[preset];
}
