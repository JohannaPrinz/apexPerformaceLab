import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModuleConfiguration } from '@apex/domain';

import { TestRunner } from './test-runner';

/**
 * The runner is the surface a coach operates standing next to an athlete, most
 * often on a tablet. These tests pin the two things that would make it unusable
 * there: every expected value must be reachable as a labelled control, and the
 * stage navigation of a multi-pass test must actually move between stages.
 *
 * Layout itself is not testable in jsdom — it computes no geometry — so nothing
 * here claims to prove there is no horizontal overflow. What it does prove is
 * that the controls exist, are reachable, and respond.
 */

const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }));
const saveStageAction = vi.fn<(entries: unknown[]) => Promise<unknown>>();
const setModuleStatusAction = vi.fn<(moduleId: string, status: string) => Promise<unknown>>();

vi.mock('../server/actions', () => ({
  addModuleNoteAction: () => Promise.resolve({}),
  setModuleStatusAction: (moduleId: string, status: string) =>
    setModuleStatusAction(moduleId, status),
  saveStageAction: (entries: unknown[]) => saveStageAction(entries),
}));

beforeEach(() => {
  saveStageAction.mockReset();
  saveStageAction.mockResolvedValue({});
  setModuleStatusAction.mockReset();
  setModuleStatusAction.mockResolvedValue({});
  push.mockReset();
});

const configuration = (over: Partial<ModuleConfiguration> = {}): ModuleConfiguration => ({
  measurementTypes: [
    { measurementTypeId: 'mt_lactate', role: 'required' },
    { measurementTypeId: 'mt_hr', role: 'required' },
  ],
  exerciseIds: [],
  passes: 1,
  recordsSide: false,
  dimensions: [],
  ...over,
});

const types = {
  mt_lactate: { name: 'Laktat', unit: 'mmol/l', valueType: 'NUMERIC' },
  mt_hr: { name: 'Herzfrequenz', unit: 'bpm', valueType: 'NUMERIC' },
};

/** The domain service computes this; the screen only displays it. */
const READINESS: Parameters<typeof TestRunner>[0]['readiness'] = {
  level: 'INSUFFICIENT',
  missingPasses: [],
  missingTypeIds: [],
  missingRecommendedTypeIds: [],
  expected: 2,
  recorded: 0,
};

/** A value already stored for a slot, shaped as the page loads it. */
const recorded = (measurementTypeId: string, value: number, passIndex: number | null = null) => ({
  id: `meas_${measurementTypeId}`,
  measurementTypeId,
  side: 'BILATERAL',
  exerciseId: null,
  passIndex,
  context: {},
  numericValue: value,
  textValue: null,
  booleanValue: null,
  note: null,
});

/** The value fields, found the way the screen builds their ids. */
const valueFields = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[id^="slot-"]')).filter(
    (element) => !element.id.endsWith('-error'),
  );

const renderRunner = (over: Partial<Parameters<typeof TestRunner>[0]> = {}) =>
  render(
    <TestRunner
      moduleId="mod_1"
      moduleKey="lactate"
      status="IN_PROGRESS"
      configuration={configuration()}
      types={types}
      exercises={{}}
      measurements={[]}
      notes={[]}
      readiness={READINESS}
      assessmentId="ass_1"
      canEdit
      {...over}
    />,
  );

describe('recording values', () => {
  it('offers one reachable input per expected value', () => {
    renderRunner();

    // Two quantities, one pass, no sides — two cells, each with its own field.
    expect(screen.getByLabelText('Laktat')).toBeInTheDocument();
    expect(screen.getByLabelText('Herzfrequenz')).toBeInTheDocument();
  });

  it('names a field by what it records, not by "Wert"', () => {
    // Two fields both called "Wert" is what a screen reader used to hear. When
    // the test takes both sides it was four.
    renderRunner({ configuration: configuration({ recordsSide: true }) });

    expect(screen.getByLabelText('Laktat · Links')).toBeInTheDocument();
    expect(screen.getByLabelText('Laktat · Rechts')).toBeInTheDocument();
    expect(screen.queryAllByLabelText('Wert')).toHaveLength(0);
  });

  it('doubles the inputs when the test records both sides', () => {
    renderRunner({ configuration: configuration({ recordsSide: true }) });

    expect(valueFields()).toHaveLength(4);
  });

  it('keeps every input enabled while the coach may edit', () => {
    renderRunner();

    for (const field of valueFields()) expect(field).toBeEnabled();
  });

  it('hides the inputs entirely when editing is not allowed', () => {
    // Read-only must remove the controls, not merely grey them: a disabled field
    // a coach can still focus on a tablet reads as a broken screen.
    renderRunner({ canEdit: false });

    expect(valueFields()).toHaveLength(0);
  });
});

describe('moving between stages', () => {
  const stepTest = { configuration: configuration({ passes: 3 }) };

  it('shows one control per stage', () => {
    renderRunner(stepTest);

    const nav = screen.getByRole('navigation', { name: 'Stufen' });

    expect(within(nav).getAllByRole('button')).toHaveLength(3);
  });

  it('starts on the first stage and says which one is current', () => {
    renderRunner(stepTest);

    const nav = screen.getByRole('navigation', { name: 'Stufen' });
    const current = within(nav)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-current') === 'step');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Stufe 1');
  });

  it('moves to another stage when it is chosen', async () => {
    const user = userEvent.setup();
    renderRunner(stepTest);

    const nav = screen.getByRole('navigation', { name: 'Stufen' });
    await user.click(within(nav).getByRole('button', { name: /Stufe 3/ }));

    expect(within(nav).getByRole('button', { name: /Stufe 3/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(within(nav).getByRole('button', { name: /Stufe 1/ })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('offers no stage navigation for a single-pass test', () => {
    renderRunner();

    expect(screen.queryByRole('navigation', { name: 'Stufen' })).toBeNull();
  });
});

describe('the actions that must stay reachable', () => {
  it('offers the status transitions the domain allows', () => {
    renderRunner();

    // Whatever the transitions are, they must be rendered as real buttons —
    // this is how a coach completes a test.
    expect(screen.getByRole('button', { name: 'Abschließen' })).toBeEnabled();
  });

  it('keeps the note field and its button together', () => {
    renderRunner();

    expect(screen.getByLabelText('Testnotiz')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Notiz hinzufügen' })).toBeInTheDocument();
  });
});

/**
 * The screens are German (§ the catalogue localisation decision). These pin the
 * wording a coach actually reads — and, just as importantly, that the English it
 * replaced is gone: a half-translated screen is worse than an English one,
 * because it reads as a bug rather than a language.
 */
describe('the German wording', () => {
  it('names the test, its status and what the data supports', () => {
    renderRunner({ status: 'IN_PROGRESS' });

    expect(screen.getByRole('heading', { name: 'Laktat' })).toBeVisible();
    expect(screen.getByText('Läuft')).toBeVisible();
    // Status is how far the coach got; readiness is what the values allow.
    // Different words on purpose.
    expect(screen.getByText('Nicht auswertbar')).toBeVisible();
  });

  it('says what has been recorded, in German', () => {
    renderRunner();

    expect(screen.getByText(/0 von 2 erfasst/)).toBeVisible();
  });

  it('labels an unrecorded value rather than leaving it blank', () => {
    renderRunner();

    expect(screen.getAllByText('Noch nicht erfasst')).toHaveLength(2);
  });

  it('leaves no English behind on the runner', () => {
    renderRunner({ configuration: configuration({ passes: 2 }) });

    const text = document.body.textContent ?? '';

    for (const word of [
      'Stage',
      'Mark complete',
      'Test notes',
      'Fully evaluable',
      'Not evaluable',
      'Add note',
      'Not recorded',
      'recorded',
      'In progress',
    ]) {
      expect(text).not.toContain(word);
    }
  });
});

/**
 * Accessibility of the runner, asserted where jsdom can actually see it.
 *
 * These are the defects a keyboard or screen-reader user would hit, not
 * cosmetic ones: a page with no top-level heading, a progress line that changes
 * silently after every save, and a stage control that gives no hint which one
 * is current.
 */
describe('reachability without a mouse', () => {
  it('gives the page a top-level heading', () => {
    // The route renders only a back link and this component, so its title is
    // the page title. A first heading at level two leaves a screen reader with
    // nothing to jump to.
    renderRunner();

    expect(screen.getByRole('heading', { level: 1, name: 'Laktat' })).toBeVisible();
  });

  it('announces the progress when it changes', () => {
    renderRunner();

    const status = screen.getByRole('status');

    expect(status).toHaveTextContent('0 von 2 erfasst');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('gives every control an accessible name', () => {
    renderRunner({ configuration: configuration({ passes: 2 }) });

    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('textbox')]) {
      expect(control).toHaveAccessibleName();
    }
  });
});

/**
 * Saving a stage.
 *
 * This is the behaviour the screen was rebuilt around: the coach fills a stage
 * and presses one button. The tests below pin what that button must guarantee —
 * one call rather than one per field, nothing written for an empty cell, no
 * duplicate when it is pressed twice, and no silent advance when the save was
 * refused.
 *
 * The action is mocked, which is the boundary this component owns. What the
 * server does with those entries — the transaction, the tenant scope, the value
 * rules — is tested against the service itself in `server/service.test.ts`;
 * asserting it here would only prove the mock.
 */
describe('saving a stage', () => {
  const entriesOf = (call: number) => saveStageAction.mock.calls[call]?.[0] ?? [];

  it('sends the whole stage in a single call', async () => {
    const user = userEvent.setup();
    renderRunner();

    await user.type(screen.getByLabelText('Laktat'), '2,4');
    await user.type(screen.getByLabelText('Herzfrequenz'), '148');
    await user.click(screen.getByRole('button', { name: 'Speichern und abschließen' }));

    expect(saveStageAction).toHaveBeenCalledTimes(1);
    expect(entriesOf(0)).toHaveLength(2);
  });

  it('reads a comma as a decimal point', async () => {
    // A German keyboard produces a comma. Refusing it would be refusing the
    // coach's own keyboard.
    const user = userEvent.setup();
    renderRunner();

    await user.type(screen.getByLabelText('Laktat'), '2,4');
    await user.click(screen.getByRole('button', { name: 'Speichern und abschließen' }));

    expect(entriesOf(0)[0]).toMatchObject({ kind: 'record', input: { value: 2.4 } });
  });

  it('writes nothing for a cell left empty', async () => {
    // A blank stays blank. The screen never fills a gap it was not given.
    const user = userEvent.setup();
    renderRunner();

    await user.type(screen.getByLabelText('Laktat'), '2.4');
    await user.click(screen.getByRole('button', { name: 'Speichern und abschließen' }));

    expect(entriesOf(0)).toHaveLength(1);
    expect(entriesOf(0)[0]).toMatchObject({ input: { measurementTypeId: 'mt_lactate' } });
  });

  it('refuses text in a numeric field before sending anything', async () => {
    const user = userEvent.setup();
    renderRunner();

    await user.type(screen.getByLabelText('Laktat'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Speichern und abschließen' }));

    expect(saveStageAction).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte eine Zahl eingeben.');
  });

  it('records a correction instead of a second reading over an existing value', async () => {
    // §13: nothing is overwritten. A value typed over an existing one
    // supersedes it, and the entry has to say so.
    const user = userEvent.setup();
    renderRunner({ measurements: [recorded('mt_lactate', 2.4)] });

    await user.type(screen.getByLabelText('Laktat'), '3.1');
    await user.click(screen.getByRole('button', { name: 'Speichern und abschließen' }));

    expect(entriesOf(0)[0]).toMatchObject({
      kind: 'correct',
      input: { measurementId: 'meas_mt_lactate', value: 3.1 },
    });
  });

  it('files no correction when the value retyped is the one already stored', async () => {
    // Otherwise every press of the save button on a reviewed stage would leave
    // a history of edits that never happened.
    const user = userEvent.setup();
    renderRunner({ measurements: [recorded('mt_lactate', 2.4)] });

    await user.type(screen.getByLabelText('Laktat'), '2.4');
    await user.click(screen.getByRole('button', { name: 'Speichern und abschließen' }));

    expect(saveStageAction).not.toHaveBeenCalled();
  });

  it('offers no note field beside a single value', () => {
    // A remark per value gave a stage of eight values eight further fields, and
    // what a coach records — „Athlet klagte über Schmerzen" — is about the
    // stage, not about one reading.
    renderRunner();

    expect(screen.queryByLabelText(/^Notiz zu /)).toBeNull();
  });

  it('does not write the stage twice when the button is pressed twice', async () => {
    const user = userEvent.setup();
    renderRunner();

    await user.type(screen.getByLabelText('Laktat'), '2.4');
    await user.dblClick(screen.getByRole('button', { name: 'Speichern und abschließen' }));

    expect(saveStageAction).toHaveBeenCalledTimes(1);
  });
});

describe('moving on after a stage', () => {
  const stepTest = { configuration: configuration({ passes: 3 }) };
  const currentStage = () =>
    within(screen.getByRole('navigation', { name: 'Stufen' }))
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-current') === 'step');

  it('advances to the next stage once the save succeeded', async () => {
    const user = userEvent.setup();
    renderRunner(stepTest);

    await user.type(screen.getByLabelText('Laktat'), '2.4');
    await user.click(screen.getByRole('button', { name: 'Weiter' }));

    expect(currentStage()).toHaveTextContent('Stufe 2');
  });

  it('sends the stage the coach is actually on', async () => {
    const user = userEvent.setup();
    renderRunner(stepTest);

    await user.click(screen.getByRole('button', { name: /Stufe 2/ }));
    await user.type(screen.getByLabelText('Laktat'), '2.4');
    await user.click(screen.getByRole('button', { name: 'Weiter' }));

    expect(saveStageAction.mock.calls[0]?.[0][0]).toMatchObject({ input: { passIndex: 2 } });
  });

  it('stays on the stage when the save was refused', async () => {
    // The stage is written whole or not at all, so a refusal means everything
    // in the fields is still unsaved. Advancing would hide that.
    saveStageAction.mockResolvedValue({
      fieldErrors: [{ slotKey: 'mt_lactate||BILATERAL|{}', message: 'Passt nicht.' }],
    });
    const user = userEvent.setup();
    renderRunner(stepTest);

    await user.type(screen.getByLabelText('Laktat'), '2.4');
    await user.click(screen.getByRole('button', { name: 'Weiter' }));

    expect(currentStage()).toHaveTextContent('Stufe 1');
  });

  it('leaves the typed values in place when the save was refused', async () => {
    saveStageAction.mockResolvedValue({ message: 'Verbindung verloren.' });
    const user = userEvent.setup();
    renderRunner(stepTest);

    await user.type(screen.getByLabelText('Laktat'), '2.4');
    await user.click(screen.getByRole('button', { name: 'Weiter' }));

    expect(screen.getByLabelText('Laktat')).toHaveValue('2.4');
    expect(screen.getByRole('alert')).toHaveTextContent('Verbindung verloren.');
  });

  it('puts a refusal on the field it belongs to', async () => {
    saveStageAction.mockResolvedValue({
      fieldErrors: [{ slotKey: 'mt_lactate||BILATERAL|{}', message: 'Passt nicht zur Messgröße.' }],
    });
    const user = userEvent.setup();
    renderRunner();

    await user.type(screen.getByLabelText('Laktat'), '2.4');
    await user.click(screen.getByRole('button', { name: 'Speichern und abschließen' }));

    expect(screen.getByLabelText('Laktat')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Passt nicht zur Messgröße.');
    expect(screen.getByLabelText('Herzfrequenz')).not.toHaveAttribute('aria-invalid');
  });

  it('clears a field refusal as soon as that field is changed', async () => {
    saveStageAction.mockResolvedValue({
      fieldErrors: [{ slotKey: 'mt_lactate||BILATERAL|{}', message: 'Passt nicht zur Messgröße.' }],
    });
    const user = userEvent.setup();
    renderRunner();

    await user.type(screen.getByLabelText('Laktat'), '2.4');
    await user.click(screen.getByRole('button', { name: 'Speichern und abschließen' }));
    await user.type(screen.getByLabelText('Laktat'), '5');

    expect(screen.getByLabelText('Laktat')).not.toHaveAttribute('aria-invalid');
  });

  it('writes nothing when the stage is skipped', async () => {
    const user = userEvent.setup();
    renderRunner(stepTest);

    await user.click(screen.getByRole('button', { name: 'Stufe überspringen' }));

    expect(saveStageAction).not.toHaveBeenCalled();
    expect(currentStage()).toHaveTextContent('Stufe 2');
  });

  it('keeps what was typed on a stage that is left', async () => {
    // Skipping ahead is a change of view, not a decision to discard. Losing the
    // typing would be a data loss the coach never asked for.
    const user = userEvent.setup();
    renderRunner(stepTest);

    await user.type(screen.getByLabelText('Laktat'), '2.4');
    await user.click(screen.getByRole('button', { name: 'Stufe überspringen' }));

    expect(screen.getByLabelText('Laktat')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: /Stufe 1/ }));

    expect(screen.getByLabelText('Laktat')).toHaveValue('2.4');
  });

  it('lets the last stage be skipped too, and lands on the summary', async () => {
    // It could not be, because there was nowhere to go. There is now: past the
    // last stage lies the result of the test.
    const user = userEvent.setup();
    renderRunner({ configuration: configuration({ passes: 2 }) });

    await user.click(screen.getByRole('button', { name: /Stufe 2/ }));

    const skip = screen.getByRole('button', { name: 'Stufe überspringen' });
    expect(skip).toBeEnabled();

    await user.click(skip);

    expect(saveStageAction).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Übersicht vor dem Abschluss' })).toBeVisible();
  });

  it('gives no stage buttons at all to someone who may not edit', () => {
    renderRunner({ ...stepTest, canEdit: false });

    expect(screen.queryByRole('button', { name: 'Weiter' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stufe überspringen' })).toBeNull();
  });
});

/**
 * Arriving at the end of a test.
 *
 * Working through the last stage used to leave the coach on the entry grid with
 * no statement that anything was finished and no way forward. These pin the
 * three exits the summary has to offer, and that a finished test is not
 * something the screen decides on its own.
 */
describe('finishing a test', () => {
  const summary = () => screen.queryByRole('heading', { name: /Übersicht vor dem Abschluss/ });

  it('shows the summary after the last stage is saved', async () => {
    const user = userEvent.setup();
    renderRunner();

    await user.type(screen.getByLabelText('Laktat'), '2.4');
    await user.click(screen.getByRole('button', { name: 'Speichern und abschließen' }));

    expect(
      await screen.findByRole('heading', { name: /Übersicht vor dem Abschluss/ }),
    ).toBeVisible();
  });

  it('does not complete the test by itself', async () => {
    // §11: whether a test is done is a professional judgement. A stage left
    // deliberately empty is a legitimate finished test, and a full one may
    // still be unfinished.
    const user = userEvent.setup();
    renderRunner();

    await user.type(screen.getByLabelText('Laktat'), '2.4');
    await user.click(screen.getByRole('button', { name: 'Speichern und abschließen' }));

    // `findBy`, not `getBy`: the save is a transition, and asserting before it
    // settles made this fail only under load — a flake, not a defect.
    expect(await screen.findByRole('button', { name: /Test abschließen/ })).toBeEnabled();
    expect(setModuleStatusAction).not.toHaveBeenCalled();
  });

  it('says which stages are short before the coach commits', async () => {
    const user = userEvent.setup();
    renderRunner({ configuration: configuration({ passes: 2 }) });

    await user.click(screen.getByRole('button', { name: /Stufe 2/ }));
    await user.click(screen.getByRole('button', { name: 'Stufe überspringen' }));

    // Two stages × two quantities, nothing entered.
    expect(screen.getByText(/4 Werte sind nicht erfasst/)).toBeVisible();
  });

  it('leads back to the stages without finishing', async () => {
    const user = userEvent.setup();
    renderRunner();

    await user.click(screen.getByRole('button', { name: 'Stufe überspringen' }));
    await user.click(screen.getByRole('button', { name: /Zurück zu den Stufen/ }));

    expect(summary()).toBeNull();
    expect(screen.getByLabelText('Laktat')).toBeVisible();
  });

  it('sends the coach to the test overview once it is finished', async () => {
    // The run ends here. Reading a finished test happens on its overview, and
    // staying on an entry grid for a test just declared finished invites a
    // change nobody meant to make.
    const user = userEvent.setup();
    renderRunner({ status: 'IN_PROGRESS' });

    await user.click(screen.getByRole('button', { name: 'Stufe überspringen' }));
    await user.click(screen.getByRole('button', { name: /Test abschließen/ }));

    expect(push).toHaveBeenCalledWith('/assessments/ass_1/tests/mod_1');
  });
});

describe('what the coach configured, on the screen where they measure', () => {
  it('names the dimension values the test records along', () => {
    // Invisible before: a coach who set the test up for the knee and the hip
    // saw neither here and had to go back to the configuration to check.
    renderRunner({
      configuration: configuration({
        dimensions: [{ key: 'joint', label: 'Gelenk', values: ['Knie', 'Hüfte'] }],
      }),
    });

    expect(screen.getByText('Gelenk')).toBeVisible();
    expect(screen.getByText('Knie · Hüfte')).toBeVisible();
  });

  it('says so when a dimension is named during the measurement instead', () => {
    renderRunner({
      configuration: configuration({ dimensions: [{ key: 'site', label: 'Messstelle' }] }),
    });

    expect(screen.getByText('wird bei der Messung benannt')).toBeVisible();
  });

  it('names the exercises the test covers', () => {
    renderRunner({
      configuration: configuration({ exerciseIds: ['ex_1'] }),
      exercises: { ex_1: 'Bankdrücken' },
    });

    expect(screen.getByText('Bankdrücken')).toBeVisible();
  });
});

describe('a value that was corrected', () => {
  it('is marked, so it is not read as a first reading', () => {
    renderRunner({
      measurements: [{ ...recorded('mt_lactate', 3.1), supersedes: { id: 'meas_old' } }],
    });

    expect(screen.getByText('korrigiert')).toBeVisible();
  });

  it('does not show the value it replaced', () => {
    // Never deleted (§13), but a column of replaced readings under the live
    // ones invites reading the wrong number off a tablet mid-session.
    renderRunner({
      measurements: [{ ...recorded('mt_lactate', 3.1), supersedes: { id: 'meas_old' } }],
    });

    expect(screen.queryByText(/Korrigierte Werte/)).toBeNull();
  });

  it('leaves an ordinary value unmarked', () => {
    renderRunner({ measurements: [recorded('mt_lactate', 2.4)] });

    expect(screen.queryByText('korrigiert')).toBeNull();
  });
});

/**
 * Defects a browser found that reading did not.
 *
 * Each of these passed typecheck, lint and the whole suite while being broken
 * in the product — which is exactly why they are pinned here rather than
 * described in a commit message.
 */
describe('what a real run turned up', () => {
  const withExercise = configuration({ exerciseIds: ['ex_1'] });

  it('sends the exercise the slot was built for', async () => {
    // Without it the procedure refuses the whole stage with EXERCISE_MISSING:
    // a test that works in movements could not record a single value.
    const user = userEvent.setup();
    renderRunner({ configuration: withExercise, exercises: { ex_1: 'Box-Kniebeuge' } });

    await user.type(screen.getByLabelText('Laktat'), '2.4');
    await user.click(screen.getByRole('button', { name: 'Speichern und abschließen' }));

    expect(saveStageAction.mock.calls[0]?.[0][0]).toMatchObject({
      kind: 'record',
      input: { exerciseId: 'ex_1' },
    });
  });

  it('sends null for a test that names no movement', () => {
    // The procedure refuses an exercise the configuration does not declare, so
    // "always send one" would break the other half of the tests.
    const user = userEvent.setup();
    renderRunner();

    return user
      .type(screen.getByLabelText('Laktat'), '2.4')
      .then(() => user.click(screen.getByRole('button', { name: 'Speichern und abschließen' })))
      .then(() => {
        expect(saveStageAction.mock.calls[0]?.[0][0]).toMatchObject({
          input: { exerciseId: null },
        });
      });
  });

  it('finishes a test that was never explicitly started', async () => {
    // `PLANNED → COMPLETED` is refused by the domain, and rightly so. But a
    // coach who has worked through every stage met "A planned test cannot
    // become completed" at the end of the run — a dead end. Both legal moves
    // are made instead.
    const user = userEvent.setup();
    renderRunner({ status: 'PLANNED' });

    await user.click(screen.getByRole('button', { name: 'Stufe überspringen' }));
    await user.click(screen.getByRole('button', { name: /Test abschließen/ }));

    expect(setModuleStatusAction.mock.calls.map((call) => call[1])).toEqual([
      'IN_PROGRESS',
      'COMPLETED',
    ]);
  });

  it('does not start a test that is already running before finishing it', async () => {
    const user = userEvent.setup();
    renderRunner({ status: 'IN_PROGRESS' });

    await user.click(screen.getByRole('button', { name: 'Stufe überspringen' }));
    await user.click(screen.getByRole('button', { name: /Test abschließen/ }));

    expect(setModuleStatusAction.mock.calls.map((call) => call[1])).toEqual(['COMPLETED']);
  });

  it('leaves exactly one accent action on the entry screen', () => {
    // "Test starten" in the header competed with "Weiter" in the stage footer —
    // two buttons that both looked like the way forward.
    renderRunner({ status: 'PLANNED' });

    const accent = screen
      .getAllByRole('button')
      .filter((button) => button.className.includes('bg-accent'));

    expect(accent.map((button) => button.textContent?.trim())).toEqual([
      'Speichern und abschließen',
    ]);
  });
});
