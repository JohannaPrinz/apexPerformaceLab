import { describe, expect, it } from 'vitest';

import { summariseAssessment, type SummaryModule } from './summary';

/**
 * The factual summary.
 *
 * Half of these tests check what it says. The other half check what it must
 * never say — and that half is the reason the function exists as a pure,
 * separately testable unit at all. The catalogue carries no reference ranges
 * and the model records no direction for any quantity, so a verdict here would
 * be invented, and an invented verdict in a health record reads exactly like a
 * measured one.
 */

const module = (over: Partial<SummaryModule> = {}): SummaryModule => ({
  name: 'Laufband Mai',
  typeLabel: 'Laktat',
  passes: 4,
  recorded: 16,
  expected: 16,
  quantities: [],
  ...over,
});

const sentencesOf = (modules: readonly SummaryModule[]): string[] =>
  summariseAssessment(modules).flatMap((section) => section.sentences);

describe('what the summary states', () => {
  it('opens with how much was recorded and over how many stages', () => {
    expect(sentencesOf([module()])[0]).toBe('16 von 16 Werten erfasst, 4 Stufen.');
  });

  it('calls a single-pass test a single recording rather than one stage', () => {
    // A test with one pass is not a stepped test with one stage — the
    // measurement records `passIndex: null` to say so.
    const [first] = sentencesOf([module({ passes: 1, recorded: 3, expected: 3 })]);

    expect(first).toBe('3 von 3 Werten erfasst, einfache Erfassung.');
  });

  it('states a single reading as a value with its unit', () => {
    const [, sentence] = sentencesOf([
      module({
        passes: 1,
        recorded: 1,
        expected: 1,
        quantities: [{ name: 'Körperfettanteil', unit: '%', values: [16.3] }],
      }),
    ]);

    expect(sentence).toBe('Körperfettanteil: 16,3 %.');
  });

  it('states several readings as the span they cover and how many there were', () => {
    const [, sentence] = sentencesOf([
      module({ quantities: [{ name: 'Laktat', unit: 'mmol/L', values: [1.2, 2.6, 5.4, 3.1] }] }),
    ]);

    expect(sentence).toBe('Laktat: 1,2 bis 5,4 mmol/L (4 Werte).');
  });

  it('writes numbers the way a German-speaking coach reads them', () => {
    const [, sentence] = sentencesOf([
      module({ passes: 1, quantities: [{ name: 'Gewicht', unit: 'kg', values: [64.5] }] }),
    ]);

    expect(sentence).toContain('64,5');
    expect(sentence).not.toContain('64.5');
  });

  it('leaves the unit out where the quantity has none', () => {
    const [, sentence] = sentencesOf([
      module({ passes: 1, quantities: [{ name: 'Wiederholungen', unit: '', values: [5] }] }),
    ]);

    expect(sentence).toBe('Wiederholungen: 5.');
  });

  it('names the method of a computed value', () => {
    // A body-fat percentage without its method is a number whose meaning
    // cannot be checked: three-site and seven-site produce different numbers
    // from the same body.
    const [, sentence] = sentencesOf([
      module({
        passes: 1,
        quantities: [
          {
            name: 'Körperfettanteil',
            unit: '%',
            values: [16.3],
            derivation: {
              method: 'Jackson & Pollock, 3 Punkte',
              inputs: 'Faltensumme 52 mm, Alter 36',
            },
          },
        ],
      }),
    ]);

    expect(sentence).toBe(
      'Körperfettanteil: 16,3 % — berechnet nach Jackson & Pollock, 3 Punkte ' +
        '(Faltensumme 52 mm, Alter 36).',
    );
  });

  it('names the method alone where the inputs are not to hand', () => {
    const [, sentence] = sentencesOf([
      module({
        passes: 1,
        quantities: [
          {
            name: 'Körperfettanteil',
            unit: '%',
            values: [16.3],
            derivation: { method: 'Jackson & Pollock, 7 Punkte' },
          },
        ],
      }),
    ]);

    expect(sentence).toBe('Körperfettanteil: 16,3 % — berechnet nach Jackson & Pollock, 7 Punkte.');
  });

  it('lists one section per test, in the order given', () => {
    const sections = summariseAssessment([
      module({ name: 'A' }),
      module({ name: 'B', typeLabel: 'Kraft' }),
    ]);

    expect(sections.map((section) => [section.name, section.typeLabel])).toEqual([
      ['A', 'Laktat'],
      ['B', 'Kraft'],
    ]);
  });

  it('says so rather than dropping a test that holds nothing', () => {
    // An analysis that silently omitted a test would leave the coach unable to
    // tell "not included" from "nothing to say".
    const sentences = sentencesOf([module({ recorded: 0, expected: 16 })]);

    expect(sentences).toEqual([
      '0 von 16 Werten erfasst, 4 Stufen.',
      'Für diesen Test liegen keine Werte vor.',
    ]);
  });

  it('skips a quantity that holds nothing without skipping the test', () => {
    const sentences = sentencesOf([
      module({
        recorded: 4,
        quantities: [
          { name: 'Laktat', unit: 'mmol/L', values: [1.2, 2.6] },
          { name: 'RPE', unit: '1–10', values: [] },
        ],
      }),
    ]);

    expect(sentences).toHaveLength(2);
    expect(sentences.join(' ')).not.toContain('RPE');
  });
});

describe('the difference between two examinations', () => {
  const withPrevious = (values: number[], previous: number) =>
    sentencesOf([
      module({
        passes: 1,
        recorded: 1,
        expected: 1,
        quantities: [{ name: 'Körperfettanteil', unit: '%', values, previous }],
      }),
    ]);

  it('states it as a signed number and nothing more', () => {
    expect(withPrevious([16.3], 18.1)[1]).toBe(
      'Körperfettanteil: 16,3 % — gegenüber dem vorherigen vergleichbaren Test −1,8 % ' +
        '(vorher 18,1 %).',
    );
  });

  it('signs an increase too', () => {
    expect(withPrevious([18.1], 16.3)[1]).toContain('+1,8 %');
  });

  it('says ±0 where nothing changed, rather than calling it stable', () => {
    expect(withPrevious([16.3], 16.3)[1]).toContain('±0');
  });

  it('states no difference for a stepped quantity', () => {
    // Subtracting the span of one stepped test from the span of another would
    // assert a pairing nobody recorded.
    const sentences = sentencesOf([
      module({
        quantities: [{ name: 'Laktat', unit: 'mmol/L', values: [1.2, 2.6, 5.4], previous: 2 }],
      }),
    ]);

    expect(sentences[1]).not.toContain('vorherigen');
  });

  it('states no difference where there is no earlier test', () => {
    const sentences = sentencesOf([
      module({ passes: 1, quantities: [{ name: 'Gewicht', unit: 'kg', values: [64.5] }] }),
    ]);

    expect(sentences[1]).toBe('Gewicht: 64,5 kg.');
  });
});

/**
 * The half this function exists for.
 */
describe('what the summary must never say', () => {
  const everything = () =>
    sentencesOf([
      module({
        quantities: [
          { name: 'Laktat', unit: 'mmol/L', values: [1.2, 2.6, 5.4] },
          {
            name: 'Körperfettanteil',
            unit: '%',
            values: [16.3],
            previous: 18.1,
            derivation: { method: 'Jackson & Pollock, 3 Punkte', inputs: 'Faltensumme 52 mm' },
          },
        ],
      }),
      module({ name: 'Leer', recorded: 0 }),
    ]).join(' ');

  it('never calls a value good or bad', () => {
    const text = everything();

    for (const word of [
      'gut',
      'schlecht',
      'besser',
      'schlechter',
      'optimal',
      'ideal',
      'auffällig',
      'unauffällig',
    ]) {
      expect(text.toLowerCase(), word).not.toContain(word);
    }
  });

  it('never calls a change an improvement or a decline', () => {
    const text = everything().toLowerCase();

    for (const word of [
      'verbessert',
      'verschlechtert',
      'fortschritt',
      'rückschritt',
      'positiv',
      'negativ',
      'zugenommen',
      'abgenommen',
    ]) {
      expect(text, word).not.toContain(word);
    }
  });

  it('never invents a reference range', () => {
    const text = everything().toLowerCase();

    for (const word of ['norm', 'referenz', 'sollwert', 'zielwert', 'zu hoch', 'zu niedrig']) {
      expect(text, word).not.toContain(word);
    }
  });

  it('never recommends anything', () => {
    const text = everything().toLowerCase();

    for (const word of ['empfehl', 'sollte', 'ratsam', 'maßnahme', 'training anpassen']) {
      expect(text, word).not.toContain(word);
    }
  });

  it('produces nothing at all for an empty selection', () => {
    // Not "no findings" — an analysis over nothing has nothing to describe.
    expect(summariseAssessment([])).toEqual([]);
  });
});
