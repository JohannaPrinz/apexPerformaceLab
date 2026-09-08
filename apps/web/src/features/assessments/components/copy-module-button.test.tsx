import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CopyModuleButton } from './copy-module-button';

/**
 * When the "copy into" menu learns about the athlete's other examinations.
 *
 * The list used to come with the page — once per test card, for a menu that is
 * shut. It is read when the menu opens now. What is asserted here: the read
 * happens then and not before, *this* assessment is offered immediately either
 * way (it is the common case and needs no list), and a failed read is said out
 * loud rather than silently shortening the menu.
 */

interface Mocks {
  calls: [string, string][];
  /** Was die Action zurückgibt — Erfolg, Fehler oder ein hängendes Versprechen. */
  result: unknown;
  copied: [string, string, string | undefined][];
}

const mocks = vi.hoisted<Mocks>(() => ({ calls: [], result: null, copied: [] }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../server/actions', () => ({
  copyModuleAction: (moduleId: string, assessmentId: string, target?: string) => {
    mocks.copied.push([moduleId, assessmentId, target]);

    return Promise.resolve({});
  },
  copyTargetsAction: (athleteId: string, assessmentId: string) => {
    mocks.calls.push([athleteId, assessmentId]);

    return Promise.resolve(mocks.result);
  },
}));

const TARGETS = {
  ok: true as const,
  targets: [{ id: 'ass_2', question: 'Rückkehr nach Verletzung' }],
};

const renderButton = () =>
  render(<CopyModuleButton moduleId="mod_1" assessmentId="ass_1" athleteId="ath_1" />);

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.copied.length = 0;
  mocks.result = TARGETS;
});

describe('the other assessments arrive with the menu', () => {
  it('reads nothing while the menu is shut', () => {
    renderButton();

    expect(mocks.calls).toEqual([]);
  });

  it('reads once on opening, for this athlete and this assessment', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole('button', { name: 'Kopieren' }));

    expect(mocks.calls).toEqual([['ath_1', 'ass_1']]);
    expect(await screen.findByText('Rückkehr nach Verletzung')).toBeTruthy();
  });

  it('offers this assessment immediately, before the rest has arrived', async () => {
    let release: (value: unknown) => void = () => {
      throw new Error('Der Ladevorgang wurde nicht angehalten.');
    };
    mocks.result = new Promise((resolve) => {
      release = resolve;
    });
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole('button', { name: 'Kopieren' }));

    // The second run of the same test — the reason this button exists — needs
    // no list and must not wait for one.
    expect(screen.getByText('In dieses Assessment')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('werden geladen');

    release(TARGETS);
    expect(await screen.findByText('Rückkehr nach Verletzung')).toBeTruthy();
  });

  it('copies into the chosen assessment', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole('button', { name: 'Kopieren' }));
    await user.click(await screen.findByText('Rückkehr nach Verletzung'));

    expect(mocks.copied).toEqual([['mod_1', 'ass_1', 'ass_2']]);
  });

  it('does not read again on a second opening', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole('button', { name: 'Kopieren' }));
    await screen.findByText('Rückkehr nach Verletzung');
    await user.click(screen.getByRole('button', { name: 'Kopieren' }));
    await user.click(screen.getByRole('button', { name: 'Kopieren' }));

    expect(mocks.calls).toHaveLength(1);
  });
});

describe('when the other assessments cannot be read', () => {
  it('says so and offers another try, without hiding this assessment', async () => {
    mocks.result = { ok: false, message: 'Die anderen Assessments konnten nicht geladen werden.' };
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole('button', { name: 'Kopieren' }));

    expect((await screen.findByRole('alert')).textContent).toContain('nicht geladen');
    expect(screen.getByText('In dieses Assessment')).toBeTruthy();

    mocks.result = TARGETS;
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByText('Rückkehr nach Verletzung')).toBeTruthy();
    expect(mocks.calls).toHaveLength(2);
  });
});
