import { describe, expect, it } from 'vitest';

import { groupAnalyses, type AnalysisMeasurement } from './analysis-list';

/**
 * Turning rows back into the analyses they came from.
 *
 * The grouping is the whole mechanism: there is no analysis object, only values
 * that share an instant. So the failures worth ruling out are the two that
 * would misrepresent an athlete's record — two sessions merged into one, or one
 * session split into two — plus the one that would show a coach's own typed
 * value as something a model computed.
 */

const at = (iso: string, over: Partial<AnalysisMeasurement> = {}): AnalysisMeasurement => ({
  id: `m_${iso}_${String(over.side ?? 'L')}_${String(over.id ?? '')}`,
  measurementTypeId: 'mt_rom',
  side: 'LEFT',
  numericValue: '96.4',
  context: { joint: 'knee' },
  capturedAt: new Date(iso),
  source: 'DERIVED',
  note: 'Kniebeugentiefe vor Saisonstart',
  ...over,
});

const units = () => '°';

describe('grouping the readings of an analysis', () => {
  it('puts everything recorded at one instant into one analysis', () => {
    const groups = groupAnalyses(
      [
        at('2026-08-26T10:00:00.000Z', { id: 'a', side: 'LEFT' }),
        at('2026-08-26T10:00:00.000Z', { id: 'b', side: 'RIGHT' }),
        at('2026-08-26T10:00:00.000Z', { id: 'c', context: { joint: 'hip' } }),
      ],
      units,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.readings).toHaveLength(3);
  });

  it('keeps two sessions apart', () => {
    const groups = groupAnalyses(
      [at('2026-08-26T10:00:00.000Z'), at('2026-07-01T09:30:00.000Z')],
      units,
    );

    expect(groups).toHaveLength(2);
  });

  it('shows the newest first', () => {
    const groups = groupAnalyses(
      [at('2026-07-01T09:30:00.000Z'), at('2026-08-26T10:00:00.000Z')],
      units,
    );

    expect(groups[0]?.capturedAt.getMonth()).toBe(7);
  });

  it('names the analysis with what the coach wrote', () => {
    const groups = groupAnalyses([at('2026-08-26T10:00:00.000Z')], units);

    expect(groups[0]?.purpose).toBe('Kniebeugentiefe vor Saisonstart');
  });

  it('survives an analysis whose rows carry no remark', () => {
    const groups = groupAnalyses([at('2026-08-26T10:00:00.000Z', { note: null })], units);

    expect(groups[0]?.purpose).toBeNull();
  });
});

describe('what is never shown as an analysis', () => {
  it('ignores a value the coach typed in by hand', () => {
    // A manual reading is a measurement, but nobody analysed a video for it.
    const groups = groupAnalyses([at('2026-08-26T10:00:00.000Z', { source: 'MANUAL' })], units);

    expect(groups).toEqual([]);
  });

  it('ignores a row that carries no instant to group by', () => {
    const groups = groupAnalyses(
      [at('2026-08-26T10:00:00.000Z', { capturedAt: undefined })],
      units,
    );

    expect(groups).toEqual([]);
  });

  it('ignores a row from a device import', () => {
    expect(groupAnalyses([at('2026-08-26T10:00:00.000Z', { source: 'IMPORT' })], units)).toEqual(
      [],
    );
  });
});

describe('reading the joint off the context', () => {
  it('finds the English key', () => {
    const groups = groupAnalyses(
      [at('2026-08-26T10:00:00.000Z', { context: { joint: 'hip' } })],
      units,
    );

    expect(groups[0]?.readings[0]?.joint).toBe('hip');
  });

  it('finds the German key a coach actually configures', () => {
    const groups = groupAnalyses(
      [at('2026-08-26T10:00:00.000Z', { context: { gelenk: 'Knie' } })],
      units,
    );

    expect(groups[0]?.readings[0]?.joint).toBe('Knie');
  });

  it('copes with a reading that names no joint', () => {
    const groups = groupAnalyses([at('2026-08-26T10:00:00.000Z', { context: null })], units);

    expect(groups[0]?.readings[0]?.joint).toBeNull();
  });

  it('carries the unit from the workspace rather than assuming degrees', () => {
    const groups = groupAnalyses([at('2026-08-26T10:00:00.000Z')], () => 'cm');

    expect(groups[0]?.readings[0]?.unit).toBe('cm');
  });

  it('reads a decimal string without losing it', () => {
    // The value crosses the server boundary as a string so the Decimal survives.
    const groups = groupAnalyses([at('2026-08-26T10:00:00.000Z', { numericValue: '96.4' })], units);

    expect(groups[0]?.readings[0]?.value).toBeCloseTo(96.4, 6);
  });

  it('keeps a missing value missing rather than calling it zero', () => {
    const groups = groupAnalyses([at('2026-08-26T10:00:00.000Z', { numericValue: null })], units);

    expect(groups[0]?.readings[0]?.value).toBeNull();
  });
});
