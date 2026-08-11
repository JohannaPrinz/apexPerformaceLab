import { describe, expect, it } from 'vitest';

import { moduleConfigurationSchema } from '@apex/domain';

import { findRecorded, isPassEmpty, passesOf, passProgress, slotsForPass } from './slots';

const configure = (overrides: Record<string, unknown> = {}) =>
  moduleConfigurationSchema.parse({ measurementTypeIds: ['lac', 'hr'], ...overrides });

const recorded = (
  measurementTypeId: string,
  passIndex: number | null,
  side = 'BILATERAL',
  context: unknown = null,
) => ({
  id: `m_${measurementTypeId}_${String(passIndex)}_${side}`,
  measurementTypeId,
  side,
  passIndex,
  context,
  numericValue: 1,
  textValue: null,
  booleanValue: null,
  note: null,
});

/**
 * The screen is built from the configuration, never from the module key. These
 * tests are what guarantee that: the same code produces a lactate step grid, a
 * two-sided strength grid and a per-joint mobility grid.
 */
describe('slots from a configuration', () => {
  it('gives one cell per quantity for a plain single-pass test', () => {
    expect(slotsForPass(configure()).map((slot) => slot.measurementTypeId)).toEqual(['lac', 'hr']);
    expect(passesOf(configure())).toEqual([null]);
  });

  it('numbers the stages of a multi-pass test', () => {
    expect(passesOf(configure({ passes: 4 }))).toEqual([1, 2, 3, 4]);
    // The grid per stage is unchanged — a stage repeats the same set.
    expect(slotsForPass(configure({ passes: 4 }))).toHaveLength(2);
  });

  it('doubles the cells for a two-sided test', () => {
    const slots = slotsForPass(configure({ measurementTypeIds: ['grip'], recordsSide: true }));

    expect(slots.map((slot) => slot.side)).toEqual(['LEFT', 'RIGHT']);
  });

  it('multiplies out a dimension that declares its values', () => {
    const slots = slotsForPass(
      configure({
        measurementTypeIds: ['rom'],
        recordsSide: true,
        dimensions: [{ key: 'joint', label: 'Joint', values: ['knee', 'hip'] }],
      }),
    );

    expect(slots).toHaveLength(4);
    expect(slots.map((slot) => `${slot.side}/${slot.context['joint'] ?? ''}`)).toEqual([
      'LEFT/knee',
      'LEFT/hip',
      'RIGHT/knee',
      'RIGHT/hip',
    ]);
  });

  /**
   * A site the coach names as they go has no target number, so it produces no
   * fixed cells — the screen offers a free row instead of inventing a count.
   */
  it('creates no fixed cell for an open dimension', () => {
    const slots = slotsForPass(
      configure({ measurementTypeIds: ['emg'], dimensions: [{ key: 'site', label: 'Site' }] }),
    );

    expect(slots).toHaveLength(1);
    expect(slots[0]?.openDimensions).toEqual([{ key: 'site', label: 'Site' }]);
  });

  it('gives every cell a distinct key', () => {
    const slots = slotsForPass(
      configure({
        measurementTypeIds: ['a', 'b'],
        recordsSide: true,
        dimensions: [{ key: 'joint', label: 'Joint', values: ['knee', 'hip'] }],
      }),
    );

    expect(new Set(slots.map((slot) => slot.key)).size).toBe(slots.length);
  });
});

describe('matching recorded values to cells', () => {
  it('matches on type, side and pass', () => {
    const slots = slotsForPass(configure({ passes: 2 }));
    const measurements = [recorded('lac', 1), recorded('lac', 2)];

    expect(findRecorded(measurements, slots[0]!, 1)?.id).toBe('m_lac_1_BILATERAL');
    expect(findRecorded(measurements, slots[0]!, 2)?.id).toBe('m_lac_2_BILATERAL');
    expect(findRecorded(measurements, slots[1]!, 1)).toBeUndefined();
  });

  it('keeps left and right apart', () => {
    const slots = slotsForPass(configure({ measurementTypeIds: ['grip'], recordsSide: true }));
    const measurements = [recorded('grip', null, 'LEFT')];

    expect(findRecorded(measurements, slots[0]!, null)?.side).toBe('LEFT');
    expect(findRecorded(measurements, slots[1]!, null)).toBeUndefined();
  });

  it('matches the closed dimension a cell stands for', () => {
    const configuration = configure({
      measurementTypeIds: ['rom'],
      dimensions: [{ key: 'joint', label: 'Joint', values: ['knee', 'hip'] }],
    });
    const slots = slotsForPass(configuration);
    const measurements = [recorded('rom', null, 'BILATERAL', { joint: 'hip' })];

    expect(findRecorded(measurements, slots[0]!, null)).toBeUndefined();
    expect(findRecorded(measurements, slots[1]!, null)).toBeDefined();
  });
});

describe('what the coach sees about a pass', () => {
  it('reports a stage that holds nothing as empty', () => {
    const measurements = [recorded('lac', 1)];

    expect(isPassEmpty(measurements, 1)).toBe(false);
    expect(isPassEmpty(measurements, 2)).toBe(true);
  });

  it('counts filled against expected per stage', () => {
    const configuration = configure({ passes: 3 });
    const measurements = [recorded('lac', 1), recorded('hr', 1), recorded('lac', 2)];

    expect(passProgress(configuration, measurements, 1)).toEqual({ filled: 2, expected: 2 });
    expect(passProgress(configuration, measurements, 2)).toEqual({ filled: 1, expected: 2 });
    expect(passProgress(configuration, measurements, 3)).toEqual({ filled: 0, expected: 2 });
  });
});
