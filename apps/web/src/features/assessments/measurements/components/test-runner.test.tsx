import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../server/actions', () => ({
  addModuleNoteAction: () => Promise.resolve({}),
  setModuleStatusAction: () => Promise.resolve({}),
  recordMeasurementAction: () => Promise.resolve({}),
  correctMeasurementAction: () => Promise.resolve({}),
}));

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

const renderRunner = (over: Partial<Parameters<typeof TestRunner>[0]> = {}) =>
  render(
    <TestRunner
      moduleId="mod_1"
      moduleKey="lactate"
      status="IN_PROGRESS"
      configuration={configuration()}
      types={types}
      measurements={[]}
      superseded={[]}
      notes={[]}
      readiness={READINESS}
      canEdit
      {...over}
    />,
  );

describe('recording values', () => {
  it('offers one reachable input per expected value', () => {
    renderRunner();

    // Two quantities, one pass, no sides — two cells, each with its own field.
    expect(screen.getAllByLabelText('Wert')).toHaveLength(2);
  });

  it('doubles the inputs when the test records both sides', () => {
    renderRunner({ configuration: configuration({ recordsSide: true }) });

    expect(screen.getAllByLabelText('Wert')).toHaveLength(4);
  });

  it('keeps every input enabled while the coach may edit', () => {
    renderRunner();

    for (const field of screen.getAllByLabelText('Wert')) expect(field).toBeEnabled();
  });

  it('hides the inputs entirely when editing is not allowed', () => {
    // Read-only must remove the controls, not merely grey them: a disabled field
    // a coach can still focus on a tablet reads as a broken screen.
    renderRunner({ canEdit: false });

    expect(screen.queryAllByLabelText('Wert')).toHaveLength(0);
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
