import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { tendencyOf, REPORT_SNAPSHOT_VERSION } from '@apex/domain';

import { documentFromSnapshot, type DocumentView } from './document';
import { ReportDocument } from './report-document';

/**
 * The assessment report, as one document.
 *
 * The rules under test are the ones that make it *one*: a video analysis appears
 * beside the tests rather than in a world of its own, the diagrams are rendered
 * rather than prepared, and the athlete's copy is the coach's copy with the
 * editing taken away — never a second rendering that can drift.
 */

/** A repetition as a V, evenly sampled: down to `low`, back up. */
function vShape(startMs: number, samples: number, stepMs: number, high: number, low: number) {
  const points: { timestampMs: number; primary: number | null }[] = [];
  const half = Math.floor(samples / 2);

  for (let index = 0; index < samples; index += 1) {
    const share = index <= half ? index / half : (samples - 1 - index) / (samples - 1 - half);
    points.push({ timestampMs: startMs + index * stepMs, primary: high - (high - low) * share });
  }

  return points;
}

function movementPayload(reps: number) {
  const signal: { timestampMs: number; primary: number | null }[] = [];
  const list: { index: number; startedAtMs: number; endedAtMs: number; durationMs: number }[] = [];
  let clock = 0;

  for (let index = 0; index < reps; index += 1) {
    const step = 40 + index * 10;
    signal.push(...vShape(clock, 21, step, 170, 70));
    const length = 20 * step;
    list.push({ index, startedAtMs: clock, endedAtMs: clock + length, durationMs: length });
    clock += length + 200;
  }

  return {
    // The key as well as the name: it decides the order of the grid's columns.
    profileKey: 'squat',
    profileName: 'Kniebeuge',
    repetitions: reps,
    durationMs: clock,
    reps: list,
    signal,
  };
}

const series = (over: Record<string, unknown> = {}) => ({
  key: 's1',
  typeName: 'Dauer',
  measurementTypeKey: 'duration',
  unit: 's',
  side: 'BILATERAL',
  exerciseName: null,
  passIndex: null,
  context: {},
  source: 'MANUAL',
  current: { value: 222, capturedAt: '2026-08-29T10:00:00.000Z' },
  previous: { value: 227, capturedAt: '2026-06-01T10:00:00.000Z' },
  difference: -5,
  best: null,
  betterDirection: 'lower',
  target: null,
  ...over,
});

const angle = (over: Record<string, unknown> = {}) => ({
  ...series({
    key: 'a1',
    typeName: 'Gelenkwinkel',
    measurementTypeKey: 'joint_angle',
    unit: '°',
    context: { joint: 'knee', position: 'gebeugt' },
    current: { value: 78, capturedAt: '2026-08-29T10:00:00.000Z' },
    previous: null,
    difference: null,
    betterDirection: null,
  }),
  ...over,
});

function snapshot(over: { movement?: unknown; media?: unknown; angleTarget?: unknown } = {}) {
  return {
    version: REPORT_SNAPSHOT_VERSION,
    publishedAt: '2026-08-29T12:00:00.000Z',
    assessment: { performedAt: '2026-08-29T09:00:00.000Z' },
    athlete: { firstName: 'Lena', lastName: 'Hofmann' },
    coach: { name: 'Johanna Prinz' },
    modules: [
      {
        moduleId: 'mod_row',
        name: 'Row 1000 m',
        typeLabel: 'HYROX',
        protocolLabel: '1000 m',
        derivations: [],
        series: [series()],
        media: [],
        movement: null,
        interpretation: 'Sauber durchgezogen.',
        recommendation: '',
      },
      {
        moduleId: 'mod_squat',
        name: 'Kniebeuge, Videoanalyse',
        typeLabel: 'Bewegungsanalyse',
        protocolLabel: null,
        derivations: [],
        series: [angle({ target: over.angleTarget ?? null })],
        media: over.media ?? [],
        movement: over.movement === undefined ? movementPayload(6) : over.movement,
        interpretation: '',
        recommendation: '',
      },
    ],
    overall: { interpretation: 'Insgesamt stabil.', recommendation: 'Weiter so.' },
  };
}

const view = (over?: Parameters<typeof snapshot>[0]): DocumentView =>
  documentFromSnapshot(snapshot(over) as never, tendencyOf);

describe('one report for the test and the video analysis', () => {
  it('shows both in the same document', () => {
    render(<ReportDocument view={view()} />);

    expect(screen.getByRole('region', { name: 'Row 1000 m' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Kniebeuge, Videoanalyse' })).toBeVisible();
  });

  it('keeps the analysis with the test it belongs to, not in a section of its own', () => {
    render(<ReportDocument view={view()} />);

    const test = screen.getByRole('region', { name: 'Kniebeuge, Videoanalyse' });

    expect(
      within(test).getByRole('region', { name: 'Bewegungsanalyse Kniebeuge, Videoanalyse' }),
    ).toBeVisible();
  });

  it('shows no analysis block for a test that had no video', () => {
    render(<ReportDocument view={view()} />);

    const test = screen.getByRole('region', { name: 'Row 1000 m' });

    expect(within(test).queryByText('Bewegungsverlauf')).toBeNull();
  });
});

describe('the diagrams are drawn, not merely prepared', () => {
  it('draws no diagram outside the test it belongs to', () => {
    // The global wall is gone: a picture states something about one test, and
    // a row of them above the document made the reader match them back up.
    render(<ReportDocument view={view()} />);

    expect(screen.queryByRole('img', { name: /Veränderung je Test/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Ergebnisse im Vergleich' })).toBeNull();
  });

  it('renders the movement curve from the recording', () => {
    const { container } = render(<ReportDocument view={view()} />);

    expect(screen.getByText('Bewegungsverlauf')).toBeVisible();
    // The curve itself, not a container that could be empty.
    expect(container.querySelector('svg polyline')).not.toBeNull();
  });

  it('keeps every picture inside the test it is of', () => {
    render(<ReportDocument view={view()} />);

    const analysis = screen.getByRole('region', { name: 'Kniebeuge, Videoanalyse' });

    // The movement curve is inside its own test's tile, not loose on the page.
    expect(within(analysis).getByText('Bewegungsverlauf')).toBeVisible();
  });

  it('states no range of motion beside the angles it is the difference of', () => {
    // 95° reached from 130° and from 175° are different movements, and only the
    // angles say which happened. The aggregate would be the same fact twice.
    render(<ReportDocument view={view()} />);

    expect(screen.queryByText(/Bewegungsumfang/i)).toBeNull();
  });
});

describe('screenshots', () => {
  const media = [
    { id: 'm1', key: 'reports/org/rep/m1.jpg', label: 'Tiefste Position', moduleId: 'mod_squat' },
  ];

  it('shows the still with what it is a picture of', () => {
    render(<ReportDocument view={view({ media })} />);

    const image = screen.getByRole('img', { name: 'Standbild: Tiefste Position' });

    expect(image).toBeVisible();
    expect(image).toHaveAttribute('src', '/api/report-media/reports/org/rep/m1.jpg');
    expect(screen.getByText('Tiefste Position')).toBeVisible();
  });

  it('shows none where the coach chose none', () => {
    render(<ReportDocument view={view()} />);

    expect(screen.queryByRole('img', { name: /^Standbild:/ })).toBeNull();
  });
});

describe('angles and their targets', () => {
  /** The analysis block, so the report-wide table cannot answer for it. */
  const block = () =>
    screen.getByRole('region', { name: 'Bewegungsanalyse Kniebeuge, Videoanalyse' });

  it('lays the angles out as a grid of joint, side and position', () => {
    render(<ReportDocument view={view()} />);

    // Open, not folded away: the table is what the analysis exists to produce.
    expect(within(block()).getByText('78°')).toBeVisible();

    // The axes are columns and row headers, never one joined line — left
    // against right is the comparison a video analysis is performed for.
    expect(within(block()).getByRole('columnheader', { name: 'gebeugt' })).toBeVisible();
    expect(within(block()).getByRole('rowheader', { name: 'knee' })).toBeVisible();
    expect(within(block()).queryByText('knee · gebeugt')).toBeNull();
  });

  it('says a target was met, in words as well as colour', () => {
    render(
      <ReportDocument
        view={view({ angleTarget: { comparison: 'at_most', degrees: 90, met: true } })}
      />,
    );

    // The analysis screen's own wording, adopted unchanged.
    expect(within(block()).getByText(/Ziel ≤ 90° erreicht/)).toBeVisible();
  });

  it('says a target was missed', () => {
    render(
      <ReportDocument
        view={view({ angleTarget: { comparison: 'at_least', degrees: 90, met: false } })}
      />,
    );

    expect(within(block()).getByText(/Ziel ≥ 90° nicht erreicht/)).toBeVisible();
  });

  it('claims nothing where no target could be matched to the reading', () => {
    render(<ReportDocument view={view()} />);

    expect(screen.queryByText(/Ziel (nicht )?erreicht/)).toBeNull();
  });
});

describe('tempo appears only where the recording supports it', () => {
  it('states the angular velocity per repetition when the set was long enough', () => {
    render(<ReportDocument view={view()} />);

    expect(screen.getByText('Tempo je Wiederholung')).toBeVisible();
    // Figures, not a sentence about them — see `MovementBlock`.
    expect(screen.getByText(/Beginn/)).toBeVisible();
    expect(screen.getByText(/Ende/)).toBeVisible();
  });

  it('shows no tempo at all where nothing could be timed', () => {
    const flat = { ...movementPayload(0), repetitions: 0 };

    render(<ReportDocument view={view({ movement: flat })} />);

    expect(screen.queryByText('Tempo je Wiederholung')).toBeNull();
  });

  it('draws no trend for a set too short to compare', () => {
    render(<ReportDocument view={view({ movement: movementPayload(2) })} />);

    // The repetitions still stand; only the comparison over the set is absent,
    // and it is absent rather than explained.
    expect(screen.getByText('Tempo je Wiederholung')).toBeVisible();
    expect(screen.queryByText(/Beginn/)).toBeNull();
  });
});

describe('the coach and the athlete read the same document', () => {
  /** Everything a reader can see, with whitespace flattened. */
  const readable = (element: HTMLElement) =>
    (element.textContent ?? '').replaceAll(/\s+/gu, ' ').trim();

  it('renders identical content, the editing aside', () => {
    const shared = render(<ReportDocument view={view()} />);
    const athlete = readable(shared.container);
    shared.unmount();

    const coach = render(
      <ReportDocument view={view()} editing={{ onText: () => undefined, disabled: false }} />,
    );

    // The coach's copy adds fields; every sentence and number the athlete sees
    // must be in it, which is what stops the two renderings drifting.
    for (const fragment of [
      'Row 1000 m',
      'Kniebeuge, Videoanalyse',
      '3:42',
      '78°',
      'Insgesamt stabil.',
    ]) {
      expect(athlete).toContain(fragment);
      expect(readable(coach.container)).toContain(fragment);
    }
  });

  it('gives the athlete no way to change anything', () => {
    render(<ReportDocument view={view()} />);

    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('gives the coach the fields, on the same document', () => {
    render(<ReportDocument view={view()} editing={{ onText: () => undefined, disabled: false }} />);

    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Kniebeuge, Videoanalyse' })).toBeVisible();
  });
});

/**
 * A body-composition test reads differently from everything else.
 *
 * Seven skinfolds are working numbers; the percentage they produce is the
 * finding. What is under test here is that the finding is the headline, that the
 * context beside it is derived only where the record supports it, and that
 * nothing is invented where it does not.
 */
describe('the body-composition tile', () => {
  const reading = (key: string, name: string, value: number, unit: string) =>
    series({
      key,
      typeName: name,
      measurementTypeKey: key,
      unit,
      current: { value, capturedAt: '2026-08-29T10:00:00.000Z' },
      previous: null,
      difference: null,
      betterDirection: null,
    });

  const bodyFatSnapshot = (athlete: Record<string, unknown>) => ({
    version: REPORT_SNAPSHOT_VERSION,
    publishedAt: '2026-08-29T12:00:00.000Z',
    assessment: { performedAt: '2026-08-29T09:00:00.000Z' },
    athlete: { firstName: 'Lena', lastName: 'Hofmann', ...athlete },
    coach: { name: 'Johanna Prinz' },
    modules: [
      {
        moduleId: 'mod_bf',
        name: 'Körperzusammensetzung',
        typeLabel: 'Body Composition',
        protocolLabel: 'Jackson & Pollock, 3 Falten',
        derivations: ['Jackson & Pollock, 3 Falten'],
        series: [
          reading('body_fat', 'Körperfett', 14.2, '%'),
          reading('weight', 'Körpergewicht', 72, 'kg'),
          reading('skinfold_thigh', 'Hautfalte Oberschenkel', 11, 'mm'),
        ],
        media: [],
        movement: null,
        interpretation: '',
        recommendation: '',
      },
    ],
    overall: { interpretation: '', recommendation: '' },
  });

  it('leads with the derived value and sets the context beside it', () => {
    render(
      <ReportDocument
        view={documentFromSnapshot(
          bodyFatSnapshot({ heightCm: 178, dateOfBirth: '1994-03-01T00:00:00.000Z' }) as never,
          tendencyOf,
        )}
      />,
    );

    const tile = screen.getByRole('region', { name: 'Körperzusammensetzung' });

    // Twice on purpose: as the headline, and again in the table of every
    // reading — a coach checking a value should find it where the others are.
    expect(within(tile).getAllByText('14,2 %')).toHaveLength(2);
    // 72 kg at 1,78 m — the formula, rounded to one place.
    expect(within(tile).getByText('22,7')).toBeVisible();
    expect(within(tile).getByText('32 Jahre')).toBeVisible();
  });

  it('omits what the record does not support rather than guessing it', () => {
    render(
      <ReportDocument view={documentFromSnapshot(bodyFatSnapshot({}) as never, tendencyOf)} />,
    );

    const tile = screen.getByRole('region', { name: 'Körperzusammensetzung' });

    expect(within(tile).getAllByText('14,2 %')).toHaveLength(2);
    expect(within(tile).queryByText('BMI')).toBeNull();
    expect(within(tile).queryByText(/Jahre$/)).toBeNull();
    // The weight is a reading, not a derivation — it stands either way.
    expect(within(tile).getByText('Gewicht')).toBeVisible();
  });

  it('puts every reading in one horizontal row, skinfolds included', () => {
    render(
      <ReportDocument view={documentFromSnapshot(bodyFatSnapshot({}) as never, tendencyOf)} />,
    );

    const table = screen.getByRole('table', { name: 'Alle Werte dieser Körperzusammensetzung' });

    expect(
      within(table).getByRole('columnheader', { name: /Hautfalte Oberschenkel/ }),
    ).toBeVisible();
    // One row of values under the headers — across, not down.
    expect(within(table).getAllByRole('row')).toHaveLength(2);
  });
});

/**
 * The percentile needs an end to count from, and a maximal strength test
 * declares none — the quantity does. See `scaleDirectionOf`.
 */
describe('where a value stands in the workspace', () => {
  it('names the group it was compared against, never a norm', () => {
    const ranked = {
      ...snapshot(),
      modules: [
        {
          ...snapshot().modules[0],
          series: [
            series({
              key: 'load',
              typeName: 'Externe Last',
              measurementTypeKey: 'external_load',
              unit: 'kg',
              current: { value: 140, capturedAt: '2026-08-29T10:00:00.000Z' },
              previous: null,
              difference: null,
              betterDirection: null,
              percentile: { percentile: 82, cohort: 11 },
            }),
          ],
        },
      ],
    };

    render(<ReportDocument view={documentFromSnapshot(ranked as never, tendencyOf)} />);

    expect(screen.getByText('82. Perzentil von 11 Athleten')).toBeVisible();
    expect(screen.getByText(/Kein externer Normwert/)).toBeVisible();
  });
});

/**
 * The grid groups a joint's two sides, whatever order the readings arrive in.
 *
 * A frozen document replays its series in the order they were written, and that
 * order put "Sprunggelenk rechts" above "Hüfte links" above "Sprunggelenk
 * links" — three joints interleaved, in the one table whose point is comparing
 * left against right.
 */
describe('the order of the angle grid', () => {
  it('puts the columns in the order the movement profile names them', () => {
    // Written flexed-first; drawn extended-first, as the analysis screen lays
    // them out. The readings arrive in whichever order they were written.
    const reversed = {
      ...snapshot(),
      modules: [
        {
          ...snapshot().modules[1],
          series: [
            angle({ key: 'a1', context: { joint: 'Knie', position: 'gebeugt' } }),
            angle({ key: 'a2', context: { joint: 'Knie', position: 'gestreckt' } }),
          ],
        },
      ],
    };

    render(<ReportDocument view={documentFromSnapshot(reversed as never, tendencyOf)} />);

    const block = screen.getByRole('region', { name: 'Bewegungsanalyse Kniebeuge, Videoanalyse' });
    const columns = within(block)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent?.trim());

    expect(columns).toEqual(['Winkel', 'Seite', 'gestreckt', 'gebeugt']);
  });

  it('keeps a joint together and puts left before right', () => {
    const scrambled = {
      ...snapshot(),
      modules: [
        {
          ...snapshot().modules[1],
          series: [
            angle({
              key: 'a1',
              side: 'RIGHT',
              context: { joint: 'Sprunggelenk', position: 'gebeugt' },
            }),
            angle({ key: 'a2', side: 'LEFT', context: { joint: 'Knie', position: 'gebeugt' } }),
            angle({
              key: 'a3',
              side: 'LEFT',
              context: { joint: 'Sprunggelenk', position: 'gebeugt' },
            }),
            angle({ key: 'a4', side: 'RIGHT', context: { joint: 'Knie', position: 'gebeugt' } }),
          ],
        },
      ],
    };

    render(<ReportDocument view={documentFromSnapshot(scrambled as never, tendencyOf)} />);

    const block = screen.getByRole('region', { name: 'Bewegungsanalyse Kniebeuge, Videoanalyse' });
    // Joint and side, cell by cell — the row's own text runs them together.
    const rows = within(block)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        [...row.querySelectorAll('th, td')].slice(0, 2).map((cell) => cell.textContent?.trim()),
      );

    expect(rows).toEqual([
      ['Sprunggelenk', 'Links'],
      ['Sprunggelenk', 'Rechts'],
      ['Knie', 'Links'],
      ['Knie', 'Rechts'],
    ]);
  });
});

/**
 * A maximal strength test, read against the coach's own orientation table.
 *
 * The rules under test are the restraints: the estimate is named after the
 * formula that produced it, a set the formula does not hold for gets no
 * estimate, and nothing at all is claimed where the table cannot answer — no
 * body weight on file, no sex stated, or a lift it does not cover.
 */
describe('the maximal strength tile', () => {
  const lift = (over: Record<string, unknown> = {}) =>
    series({
      key: 'load',
      typeName: 'Externe Last',
      measurementTypeKey: 'external_load',
      unit: 'kg',
      exerciseName: 'Kniebeuge',
      exerciseKey: 'squat',
      current: { value: 132.5, capturedAt: '2026-08-29T10:00:00.000Z' },
      previous: null,
      difference: null,
      betterDirection: null,
      ...over,
    });

  const reps = (over: Record<string, unknown> = {}) =>
    series({
      key: 'reps',
      typeName: 'Wiederholungen',
      measurementTypeKey: 'repetitions',
      unit: 'Wdh.',
      exerciseName: 'Kniebeuge',
      exerciseKey: 'squat',
      current: { value: 5, capturedAt: '2026-08-29T10:00:00.000Z' },
      previous: null,
      difference: null,
      betterDirection: null,
      ...over,
    });

  const strengthSnapshot = (athlete: Record<string, unknown>, rows = [lift(), reps()]) => ({
    ...snapshot(),
    athlete: { firstName: 'Rune', lastName: 'Falk', ...athlete },
    modules: [{ ...snapshot().modules[0], name: 'Maximalkrafttest', series: rows }],
  });

  const render1RM = (athlete: Record<string, unknown>, rows?: ReturnType<typeof lift>[]) =>
    render(
      <ReportDocument
        view={documentFromSnapshot(strengthSnapshot(athlete, rows) as never, tendencyOf)}
      />,
    );

  it('estimates the maximum by Epley and names the formula', () => {
    render1RM({ weightKg: 80, sex: 'male' });

    // 132,5 × (1 + 5/30) = 154,58…
    expect(screen.getByRole('columnheader', { name: '1RM (Epley)' })).toBeVisible();
    expect(screen.getByText('154,6 kg')).toBeVisible();
  });

  it('names the level the table gives and the multiple it rests on', () => {
    render1RM({ weightKg: 80, sex: 'male' });

    // 154,58 / 80 = 1,93× — above the male squat intermediate entry of 1,2.
    expect(screen.getByText('Fortgeschritten')).toBeVisible();
    // Twice on purpose: in the sentence, and again in the table it rests on.
    expect(screen.getAllByText(/1,93×/)).toHaveLength(2);
    expect(screen.getByText(/Kein externer Normwert/)).toBeVisible();
  });

  it('reads the same lift differently for the sexes the table distinguishes', () => {
    render1RM({ weightKg: 80, sex: 'female' });

    // The same 1,93× clears the female elite entry of 1,5.
    expect(screen.getByText('Profi')).toBeVisible();
  });

  it('claims no level without a body weight, and still shows the estimate', () => {
    render1RM({ sex: 'male' });

    expect(screen.queryByText('Fortgeschritten')).toBeNull();
    expect(screen.queryByText(/Kraftstandards/)).toBeNull();
    expect(screen.getByText('154,6 kg')).toBeVisible();
  });

  it('offers no estimate for a set the formula does not hold for', () => {
    render1RM({ weightKg: 80, sex: 'male' }, [
      lift(),
      reps({ current: { value: 15, capturedAt: '2026-08-29T10:00:00.000Z' } }),
    ]);

    // The load stands; the estimate and the level do not. Read inside the
    // tile's own table — the document-wide one below holds the load as well.
    const table = screen.getByRole('table', {
      name: 'Erfasste Lasten und geschätztes Einer-Maximum',
    });

    expect(within(table).getByText('132,5 kg')).toBeVisible();
    expect(within(table).queryByText('154,6 kg')).toBeNull();
    expect(screen.queryByText('Fortgeschritten')).toBeNull();
  });

  it('says nothing about a lift the table does not cover', () => {
    render1RM({ weightKg: 80, sex: 'male' }, [
      lift({ exerciseKey: 'leg_press', exerciseName: 'Beinpresse' }),
      reps({ exerciseKey: 'leg_press', exerciseName: 'Beinpresse' }),
    ]);

    expect(screen.queryByText(/Kraftstandards/)).toBeNull();
    expect(screen.getByText('154,6 kg')).toBeVisible();
  });
});
