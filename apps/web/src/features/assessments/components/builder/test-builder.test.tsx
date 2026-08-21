import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TestBuilder } from './test-builder';

/**
 * The configuration wizard, at the two points where a real run found it losing
 * the coach's work.
 *
 * Both defects passed typecheck, lint and the whole suite while being broken in
 * the product: one silently erased a typed name, the other forbade something
 * §11 explicitly permits. Neither is visible from reading the draft logic,
 * which is why they are pinned against the rendered screen.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../../server/actions', () => ({
  addConfiguredModuleAction: () => Promise.resolve({}),
  updateModuleConfigurationAction: () => Promise.resolve({}),
}));

const renderBuilder = (takenModuleKeys: readonly string[] = []) =>
  render(
    <TestBuilder
      assessmentId="ass_1"
      measurementTypes={[
        {
          id: 'mt_1',
          key: 'lactate',
          name: 'Laktat',
          unit: 'mmol/l',
          category: 'metabolic',
          ownedByWorkspace: false,
        },
      ]}
      exercises={[]}
      takenModuleKeys={takenModuleKeys}
    />,
  );

describe('naming a test', () => {
  it('keeps the name when the type is chosen afterwards', async () => {
    // The type button rebuilt the draft from scratch. A coach who typed the
    // name first and picked the type second lost the name with no message —
    // and "Weiter" then refused, blaming a field that looked filled.
    const user = userEvent.setup();
    renderBuilder();

    await user.type(screen.getByLabelText('Name des Tests'), 'Sprint 2');
    await user.click(screen.getByRole('button', { name: /^Kraft/ }));

    expect(screen.getByLabelText('Name des Tests')).toHaveValue('Sprint 2');
  });

  it('lets the coach move on once the test has a name', async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.type(screen.getByLabelText('Name des Tests'), 'Sprint 2');
    await user.click(screen.getByRole('button', { name: /^Mobilität/ }));

    expect(screen.getByRole('button', { name: 'Weiter' })).toBeEnabled();
  });
});

describe('choosing a type the assessment already holds', () => {
  it('offers it rather than locking it', () => {
    // §11: several tests of one type in one session is the ordinary case, and
    // the name is what tells them apart. The lock outlived the rule.
    renderBuilder(['strength']);

    expect(screen.getByRole('button', { name: /^Kraft/ })).toBeEnabled();
  });

  it('still says the assessment already holds one', () => {
    // Offered, not hidden: the coach should know they are adding a second.
    renderBuilder(['strength']);

    expect(screen.getByRole('button', { name: /^Kraft/ })).toHaveTextContent(
      'schon einmal enthalten',
    );
  });
});

describe('the German wording', () => {
  it('leaves no English behind on the first step', () => {
    renderBuilder();

    const text = document.body.textContent ?? '';

    for (const word of ['A template is', 'starting point', 'Fully recorded', 'measurements']) {
      expect(text, word).not.toContain(word);
    }
  });
});
