import { describe, expect, it } from 'vitest';

import {
  ASSESSMENT_PRESETS,
  isModuleKey,
  MODULE_KEYS,
  MODULE_LABELS,
  modulesForPreset,
  type ModuleKey,
} from './index';

/**
 * The registry is small enough to read, which is exactly why it needs tests:
 * the rules it encodes are domain decisions that a plausible-looking edit can
 * break without anything else failing.
 */
describe('module registry', () => {
  it('holds the canonical eleven (§11)', () => {
    expect(MODULE_KEYS).toEqual([
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
    ]);
  });

  it('labels every key', () => {
    for (const key of MODULE_KEYS) {
      expect(MODULE_LABELS[key], `missing label for "${key}"`).toBeTruthy();
    }
  });

  it('carries no device, vendor or competition name', () => {
    // Module names are domain terms only (DOMAIN_RULES #8). These are the names
    // the documents name explicitly as *not* modules.
    const forbidden = ['vald', 'myoact', 'garmin', 'polar', 'hyrox', 'video'];

    for (const key of MODULE_KEYS) {
      expect(forbidden, `"${key}" is a source or format, not a module`).not.toContain(key);
    }
  });

  it('recognises a key and rejects anything else', () => {
    expect(isModuleKey('lactate')).toBe(true);
    expect(isModuleKey('hyrox')).toBe(false);
    expect(isModuleKey('')).toBe(false);
  });
});

describe('assessment presets', () => {
  /**
   * Presets and modules share one namespace in the interface. If a preset were
   * called `movement`, "choose movement" would be ambiguous — which is why §11
   * forbids the overlap outright.
   */
  it('never shadows a module key', () => {
    for (const preset of Object.keys(ASSESSMENT_PRESETS)) {
      expect(MODULE_KEYS, `preset "${preset}" collides with a module key`).not.toContain(preset);
    }
  });

  it('composes only real modules', () => {
    for (const [preset, modules] of Object.entries(ASSESSMENT_PRESETS)) {
      for (const module of modules as readonly ModuleKey[]) {
        expect(isModuleKey(module), `preset "${preset}" references "${module}"`).toBe(true);
      }
    }
  });

  it('resolves a preset to its modules', () => {
    expect(modulesForPreset('hyrox')).toEqual(['running', 'strength', 'movement']);
    expect(modulesForPreset('lactate_test')).toEqual(['lactate']);
  });
});
