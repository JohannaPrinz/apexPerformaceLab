import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MODULE_KEYS } from '@apex/domain';

import { CreateTestDialog } from './create-test-dialog';

/**
 * When the "add a test" dialog fetches what it picks from.
 *
 * The lists — 200 exercises, every quantity, every saved template — used to
 * arrive as props, which made the assessment page read all of it before
 * rendering a dialog that is shut. What is asserted here is the part that
 * changed: **nothing is read until the dialog opens**, the dialog offers the
 * same choices once it has them, and a coach is told when the read fails
 * instead of being shown an empty picker.
 *
 * The action is stubbed because this is about the moment of the call, not about
 * who may make it — the procedures behind it are unchanged and enforce that
 * themselves.
 */

const mocks = vi.hoisted<{ calls: number; result: unknown }>(() => ({
  calls: 0,
  result: null,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../server/actions', () => ({
  addConfiguredModuleAction: () => Promise.resolve({}),
  deleteModuleTemplateAction: () => Promise.resolve({}),
  renameModuleTemplateAction: () => Promise.resolve({}),
  saveModuleTemplateAction: () => Promise.resolve({}),
  testCatalogueAction: () => {
    mocks.calls += 1;

    return Promise.resolve(mocks.result);
  },
}));

const CATALOGUE = {
  ok: true as const,
  exercises: [{ id: 'ex_1', name: 'Kniebeuge', category: 'strength', scope: 'SYSTEM' }],
  measurementTypes: [
    { id: 'mt_1', key: 'lactate', name: 'Laktat', unit: 'mmol/l', category: 'endurance' },
  ],
  ownTemplates: [
    {
      id: 'tpl_1',
      name: 'Unser Standardprotokoll',
      moduleKey: MODULE_KEYS[0],
      configuration: {
        measurementTypes: [{ measurementTypeId: 'mt_1', role: 'required' }],
        exerciseIds: [],
        passes: 1,
        recordsSide: false,
        dimensions: [],
      },
    },
  ],
};

beforeEach(() => {
  mocks.calls = 0;
  mocks.result = CATALOGUE;
});

describe('the catalogue arrives when the dialog does', () => {
  it('reads nothing while the dialog is shut', () => {
    render(<CreateTestDialog assessmentId="ass_1" />);

    expect(screen.getByRole('button', { name: 'Test hinzufügen' })).toBeTruthy();
    expect(mocks.calls).toBe(0);
  });

  it('reads once when it is opened, and offers what came back', async () => {
    const user = userEvent.setup();
    render(<CreateTestDialog assessmentId="ass_1" />);

    await user.click(screen.getByRole('button', { name: 'Test hinzufügen' }));

    expect(mocks.calls).toBe(1);
    // The workspace's own template is in the picker — which is only possible
    // with the list the action returned.
    expect(await screen.findByText('Unser Standardprotokoll')).toBeTruthy();
  });

  it('does not read again on a second opening', async () => {
    const user = userEvent.setup();
    render(<CreateTestDialog assessmentId="ass_1" />);

    await user.click(screen.getByRole('button', { name: 'Test hinzufügen' }));
    await screen.findByText('Unser Standardprotokoll');
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    await user.click(screen.getByRole('button', { name: 'Test hinzufügen' }));

    expect(mocks.calls).toBe(1);
    expect(await screen.findByText('Unser Standardprotokoll')).toBeTruthy();
  });
});

describe('when the catalogue cannot be read', () => {
  it('says so, and offers another try rather than an empty form', async () => {
    mocks.result = { ok: false, message: 'Die Auswahl konnte nicht geladen werden.' };
    const user = userEvent.setup();
    render(<CreateTestDialog assessmentId="ass_1" />);

    await user.click(screen.getByRole('button', { name: 'Test hinzufügen' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('nicht geladen');
    // No half-usable form behind the message: a test cannot be assembled
    // without the quantities it would record.
    expect(screen.queryByLabelText('Name des Tests')).toBeNull();

    mocks.result = CATALOGUE;
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByText('Unser Standardprotokoll')).toBeTruthy();
    expect(mocks.calls).toBe(2);
  });
});
