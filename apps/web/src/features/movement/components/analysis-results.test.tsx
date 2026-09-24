import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  analyseMovement,
  angleValueId,
  JOINT_DIMENSION_KEY,
  moduleConfigurationSchema,
  movementValues,
  POSITION_DIMENSION_KEY,
  rangeValueId,
  SQUAT_PROFILE,
  summariseBlocks,
  type AngleTargetConfig,
  type MovementResult,
  type PlannedMeasurement,
  type PoseFrame,
} from '@apex/domain';

import { AnalysisResults } from './analysis-results';

/**
 * The screen between an analysis and the record.
 *
 * ## What is worth asserting here
 *
 * That a number the model produced does not become a stored fact without the
 * coach agreeing to it; that a value which **cannot** be stored says so instead
 * of disappearing; and that a target the coach set is reported against the value
 * they can see and edit. All three are invisible to a type checker and all three
 * are the difference between a helpful tool and a quietly wrong athlete record.
 *
 * ## What is deliberately not asserted here
 *
 * The tenant boundary. It lives in the service and is tested against the service
 * (`measurements/server/video-analysis.test.ts`); proving it against a mocked
 * action would prove only that the mock was called.
 */

const mocks = vi.hoisted(() => ({
  saves: [] as { moduleId: string; planned: readonly PlannedMeasurement[]; note: string }[],
  failure: null as string | null,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('../server/actions', () => ({
  saveVideoAnalysisAction: (
    moduleId: string,
    planned: readonly PlannedMeasurement[],
    note: string,
  ) => {
    mocks.saves.push({ moduleId, planned, note });

    return Promise.resolve(
      mocks.failure === null ? { savedCount: planned.length } : { message: mocks.failure },
    );
  },
  // Stills are uploaded after a successful save. Nothing here exercises them —
  // the fixtures carry none — but the module must still resolve.
  uploadAnalysisStillAction: () => Promise.resolve({ key: 'analysis/o/m/flexed__x.jpg' }),
  // Filed after the values. The fixtures carry no curve; the module must resolve.
  recordMovementAnalysisAction: () => Promise.resolve({}),
}));

const DEG = Math.PI / 180;

/** The stick figure, so the rendered numbers are real measurements. */
function squatVideo(count: number): PoseFrame[] {
  const frames: PoseFrame[] = [];
  let index = 0;

  const push = (depth: number) => {
    const shank = 2 + 43 * depth;
    const thigh = 3 + 52 * depth;
    const trunk = 2 + 38 * depth;
    const point = (x: number, y: number) => ({ x, y, z: 0, visibility: 1 });

    const ankle = { x: 0.5, y: 0.9 };
    const knee = {
      x: ankle.x + 0.2 * Math.sin(shank * DEG),
      y: ankle.y - 0.2 * Math.cos(shank * DEG),
    };
    const hip = {
      x: knee.x - 0.2 * Math.sin(thigh * DEG),
      y: knee.y - 0.2 * Math.cos(thigh * DEG),
    };
    const shoulder = {
      x: hip.x + 0.28 * Math.sin(trunk * DEG),
      y: hip.y - 0.28 * Math.cos(trunk * DEG),
    };

    const pose = Array.from({ length: 33 }, () => point(0, 0));
    const place = (left: number, right: number, at: { x: number; y: number }) => {
      pose[left] = point(at.x, at.y);
      pose[right] = point(at.x + 0.01, at.y);
    };

    place(11, 12, shoulder);
    place(23, 24, hip);
    place(25, 26, knee);
    place(27, 28, ankle);
    place(29, 30, { x: ankle.x - 0.03, y: ankle.y });
    place(31, 32, { x: ankle.x + 0.09, y: ankle.y });

    frames.push({ timestampMs: index * 33, landmarks: pose, aspectRatio: 1 });
    index += 1;
  };

  for (let rep = 0; rep < count; rep += 1) {
    for (let i = 0; i < 10; i += 1) push(0);
    for (let i = 0; i < 30; i += 1) push((i + 1) / 30);
    for (let i = 0; i < 30; i += 1) push(1 - (i + 1) / 30);
  }
  for (let i = 0; i < 10; i += 1) push(0);

  return frames;
}

const ALL = SQUAT_PROFILE.tracks.map((track) => track.key);

function measure(tracks: readonly string[] = ALL): MovementResult {
  const outcome = analyseMovement(squatVideo(3), SQUAT_PROFILE, tracks);
  if (!outcome.ok) throw new Error('the fixture video should analyse');

  return outcome.result;
}

const TYPE_ANGLE = 'mt_angle';
const TYPES = {
  [TYPE_ANGLE]: { key: 'joint_angle', name: 'Joint Angle', unit: '°' },
};

const CONFIGURATION = moduleConfigurationSchema.parse({
  measurementTypes: [{ measurementTypeId: TYPE_ANGLE }],
  recordsSide: true,
  dimensions: [
    { key: JOINT_DIMENSION_KEY, label: 'Gelenk' },
    { key: POSITION_DIMENSION_KEY, label: 'Position' },
  ],
});

function show(
  options: {
    tracks?: readonly string[];
    targets?: readonly AngleTargetConfig[];
    configuration?: typeof CONFIGURATION;
    onSaved?: () => void;
  } = {},
) {
  mocks.saves.length = 0;
  mocks.failure = null;

  const tracks = options.tracks ?? ALL;
  const result = measure(tracks);
  const values = movementValues(result, SQUAT_PROFILE);
  const targets = options.targets ?? [];

  return render(
    <AnalysisResults
      profile={SQUAT_PROFILE}
      tracks={tracks}
      targets={targets}
      values={values}
      keyframes={[]}
      movement={{ profileKey: SQUAT_PROFILE.key, tracks: [...tracks], targets: [] }}
      drafts={{}}
      onDraft={vi.fn()}
      excluded={[]}
      onToggle={vi.fn()}
      summary={summariseBlocks(result, SQUAT_PROFILE, values, targets)}
      moduleId="mod_1"
      assessmentId="as_1"
      configuration={options.configuration ?? CONFIGURATION}
      types={TYPES}
      exerciseId="ex_1"
      recordedAt="2026-08-27T10:00:00.000Z"
      onRestart={vi.fn()}
      onSaved={options.onSaved}
    />,
  );
}

const table = () => screen.getByRole('region', { name: 'Winkel je Position' });

describe('showing what was measured', () => {
  it('shows every selected angle at both positions', () => {
    show();

    expect(within(table()).getByLabelText('Knie gestreckt links in Grad')).toBeInTheDocument();
    expect(within(table()).getByLabelText('Knie gebeugt links in Grad')).toBeInTheDocument();
    expect(within(table()).getByLabelText('Hüfte gebeugt rechts in Grad')).toBeInTheDocument();
    expect(
      within(table()).getByLabelText('Sprunggelenk gebeugt links in Grad'),
    ).toBeInTheDocument();
  });

  it('shows nothing at all for an angle the coach deselected', () => {
    // Not greyed out, not marked missing — absent. The coach said it is not
    // relevant here.
    show({ tracks: ['knee'] });

    expect(within(table()).getByLabelText('Knie gebeugt links in Grad')).toBeInTheDocument();
    expect(within(table()).queryByLabelText('Hüfte gebeugt links in Grad')).toBeNull();
    expect(screen.queryByText(/Sprunggelenk/)).toBeNull();
  });

  it('says why a value cannot be stored rather than hiding it', () => {
    show();

    const refused = screen.getByRole('region', { name: 'Nicht speicherbar' });

    expect(within(refused).getByText(/Ø Tempo/)).toBeInTheDocument();
    expect(within(refused).getAllByText(/keine Messgröße im Katalog/).length).toBeGreaterThan(0);
  });

  it('grades nothing', () => {
    show();

    const text = document.body.textContent?.toLowerCase() ?? '';

    for (const verdict of ['gute technik', 'schlechte', 'risiko', 'score', 'bewertung der']) {
      expect(text).not.toContain(verdict);
    }
  });
});

describe('a target the coach set', () => {
  const depth: AngleTargetConfig = {
    track: 'knee',
    position: 'flexed',
    comparison: 'at_most',
    degrees: 90,
  };

  it('marks the cell and says so in words, not only in colour', () => {
    show({ targets: [depth] });

    expect(within(table()).getAllByText('Ziel erreicht').length).toBeGreaterThan(0);
  });

  it('reports a miss just as plainly', () => {
    show({ targets: [{ ...depth, degrees: 40 }] });

    expect(within(table()).getAllByText('Ziel nicht erreicht').length).toBeGreaterThan(0);
  });

  it('says nothing about a target where none was set', () => {
    show();

    expect(screen.queryByText('Ziel erreicht')).toBeNull();
    expect(screen.queryByText('Ziel nicht erreicht')).toBeNull();
  });

  it('carries two different targets independently', () => {
    show({
      targets: [
        depth,
        { track: 'ankle', position: 'flexed', comparison: 'at_least', degrees: 300 },
      ],
    });

    expect(within(table()).getAllByText('Ziel erreicht').length).toBeGreaterThan(0);
    expect(within(table()).getAllByText('Ziel nicht erreicht').length).toBeGreaterThan(0);
  });

  it('states the criterion beside the measurement', () => {
    show({ targets: [depth] });

    expect(within(table()).getByText(/Ziel ≤ 90°/)).toBeInTheDocument();
  });
});

describe('the coach decides what is kept', () => {
  it('saves the storable values on request', async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole('button', { name: /Ergebnisse speichern/ }));

    expect(mocks.saves).toHaveLength(1);
    expect(mocks.saves[0]?.moduleId).toBe('mod_1');
    expect(mocks.saves[0]?.planned.length).toBeGreaterThan(0);
  });

  it('stores the angles and never the tempo', async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole('button', { name: /Ergebnisse speichern/ }));

    for (const entry of mocks.saves[0]?.planned ?? []) {
      expect(entry.measurementTypeId).toBe(TYPE_ANGLE);
      expect(entry.context).toHaveProperty('position');
    }
  });

  it('offers the summary as the note and sends what was edited', async () => {
    const user = userEvent.setup();
    show({ targets: [{ track: 'knee', position: 'flexed', comparison: 'at_most', degrees: 90 }] });

    const note = screen.getByRole('textbox', { name: 'Auswertung zum Test' });

    expect((note as HTMLTextAreaElement).value).toContain('Ziel erreicht');

    await user.clear(note);
    await user.type(note, 'Tiefe wie besprochen.');
    await user.click(screen.getByRole('button', { name: /Ergebnisse speichern/ }));

    expect(mocks.saves[0]?.note).toBe('Tiefe wie besprochen.');
  });

  it('shows a refusal instead of claiming success', async () => {
    const user = userEvent.setup();
    show();
    mocks.failure = 'Dieser Test ist nicht mehr erreichbar.';

    await user.click(screen.getByRole('button', { name: /Ergebnisse speichern/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('nicht mehr erreichbar');
  });

  it('tells the screen once the values are saved, and not for a refusal', async () => {
    // The video screen waits for this before it offers to delete a stored
    // video — before it, the analysis exists nowhere but on the screen.
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const { unmount } = show({ onSaved });

    await user.click(screen.getByRole('button', { name: /Ergebnisse speichern/ }));
    await screen.findByText(/zum Test gespeichert/);
    expect(onSaved).toHaveBeenCalledTimes(1);
    unmount();

    const refused = vi.fn();
    show({ onSaved: refused });
    mocks.failure = 'Dieser Test ist nicht mehr erreichbar.';
    await user.click(screen.getByRole('button', { name: /Ergebnisse speichern/ }));
    await screen.findByRole('alert');
    expect(refused).not.toHaveBeenCalled();
  });

  it('confirms what was saved', async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole('button', { name: /Ergebnisse speichern/ }));

    expect(await screen.findByText(/zum Test gespeichert/)).toBeInTheDocument();
  });
});

describe('an older test that records ranges', () => {
  const legacy = moduleConfigurationSchema.parse({
    measurementTypes: [{ measurementTypeId: 'mt_rom' }],
    recordsSide: true,
    dimensions: [{ key: JOINT_DIMENSION_KEY, label: 'Gelenk' }],
  });

  it('keeps working, storing its ranges', async () => {
    // A test configured before joint angles existed must not break, and must
    // not be reinterpreted: its ranges stay ranges.
    const user = userEvent.setup();

    mocks.saves.length = 0;
    mocks.failure = null;

    const result = measure();
    const values = movementValues(result, SQUAT_PROFILE);

    render(
      <AnalysisResults
        profile={SQUAT_PROFILE}
        tracks={ALL}
        targets={[]}
        values={values}
        keyframes={[]}
        movement={{ profileKey: SQUAT_PROFILE.key, tracks: [...ALL], targets: [] }}
        drafts={{}}
        onDraft={vi.fn()}
        excluded={[]}
        onToggle={vi.fn()}
        summary={summariseBlocks(result, SQUAT_PROFILE, values)}
        moduleId="mod_old"
        assessmentId="as_old"
        configuration={legacy}
        types={{ mt_rom: { key: 'range_of_motion', name: 'Range of Motion', unit: '°' } }}
        exerciseId="ex_1"
        recordedAt="2026-08-27T10:00:00.000Z"
        onRestart={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Ergebnisse speichern/ }));

    const planned = mocks.saves[0]?.planned ?? [];

    expect(planned.length).toBeGreaterThan(0);
    for (const entry of planned) {
      expect(entry.measurementTypeId).toBe('mt_rom');
      // Not reinterpreted as an angle: no position axis, no position value.
      expect(entry.context).not.toHaveProperty('position');
    }

    const ids = planned.map((entry) => entry.value);

    expect(ids.length).toBe(SQUAT_PROFILE.tracks.length * SQUAT_PROFILE.sides.length);
    expect(rangeValueId('knee', 'left')).toBeTruthy();
    expect(angleValueId('knee', 'left', 'flexed')).toBeTruthy();
  });
});
