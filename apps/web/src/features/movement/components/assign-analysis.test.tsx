import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SQUAT_PROFILE } from '@apex/domain';

import { AssignAnalysis, keptSentence } from './assign-analysis';

/**
 * Filing an analysis to an athlete — and telling the screen that it happened.
 *
 * What is pinned here is the one signal the video screen waits for before it
 * offers to delete a stored video: `onSaved` fires after the values are filed,
 * and never for a refusal. A save that reported itself early would bring back
 * the lost analysis this exists to prevent.
 */

const mocks = vi.hoisted(() => ({
  failure: null as string | null,
  saves: 0,
}));

vi.mock('../server/actions', () => ({
  saveStandaloneAnalysisAction: () => {
    mocks.saves += 1;

    return Promise.resolve(
      mocks.failure === null
        ? { assessmentId: 'as_1', moduleId: 'mod_1', savedCount: 2, createdTest: true }
        : { message: mocks.failure },
    );
  },
  uploadAnalysisStillAction: () => Promise.resolve({}),
}));

beforeEach(() => {
  mocks.failure = null;
  mocks.saves = 0;
});

function show(onSaved = vi.fn(), onRestart = vi.fn()) {
  render(
    <AssignAnalysis
      profile={SQUAT_PROFILE}
      tracks={[]}
      targets={[]}
      values={[]}
      drafts={{}}
      onDraft={vi.fn()}
      excluded={[]}
      onToggle={vi.fn()}
      summary={[]}
      athletes={[{ id: 'ath_1', name: 'Berg, Mara' }]}
      assessments={[]}
      suggestedAthleteId="ath_1"
      exerciseId="ex_squat"
      recordedAt="2026-09-14T10:00:00.000Z"
      keyframes={[]}
      movement={{ profileKey: SQUAT_PROFILE.key, tracks: [], targets: [] }}
      onRestart={onRestart}
      onSaved={onSaved}
    />,
  );

  return { onSaved, onRestart };
}

const fillAndSave = async () => {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText(/Kniebeugentiefe/u), 'Formcheck');
  await user.click(screen.getByRole('button', { name: /Athlet zuordnen und speichern/u }));
};

describe('what saving says it keeps', () => {
  it('names the stills as kept where a store keeps them, and the video as stored', () => {
    const said = keptSentence(true, true);

    expect(said).toMatch(/Werte, Ihre Auswertung und die Standbilder/u);
    expect(said).toMatch(/Video bleibt in der Ablage/u);
    // The sentence this replaced said both stay on the device.
    expect(said).not.toMatch(/auf diesem Gerät/u);
  });

  it('keeps saying the truth for a picked file without a store', () => {
    const said = keptSentence(false, false);

    expect(said).toMatch(/Standbilder bleiben auf diesem Gerät/u);
    expect(said).toMatch(/Video bleibt auf diesem Gerät/u);
  });
});

describe('reporting that the analysis is kept', () => {
  it('tells the screen once the analysis is saved', async () => {
    const { onSaved } = show();

    await fillAndSave();

    expect(await screen.findByText(/Werte wurden gespeichert/u)).toBeVisible();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('tells it nothing when saving is refused', async () => {
    mocks.failure = 'Dieses Assessment ist abgeschlossen.';
    const { onSaved } = show();

    await fillAndSave();

    expect((await screen.findByRole('alert')).textContent).toContain('abgeschlossen');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('does not report a save that was never asked for', async () => {
    const user = userEvent.setup();
    const { onSaved, onRestart } = show();

    await user.click(screen.getByRole('button', { name: 'Verwerfen' }));

    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(mocks.saves).toBe(0);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
