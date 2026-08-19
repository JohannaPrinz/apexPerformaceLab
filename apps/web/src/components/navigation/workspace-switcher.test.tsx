import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceSwitcher } from './workspace-switcher';

/**
 * Switching writes one field — `Session.activeOrganizationId` — and everything
 * else follows from it. These tests pin the two things that would make it
 * useless: it must not get in the way when there is nothing to switch to, and
 * it must actually switch when there is.
 */

const mocks = vi.hoisted(() => ({ setActive: [] as string[], refreshed: 0 }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    refresh: () => {
      mocks.refreshed += 1;
    },
  }),
}));

vi.mock('@apex/auth/client', () => ({
  organization: {
    setActive: ({ organizationId }: { organizationId: string }) => {
      mocks.setActive.push(organizationId);

      return Promise.resolve({});
    },
  },
}));

const ROLES = { owner: 'Inhaber', coach: 'Coach' };

const TWO = [
  { id: 'org_a', name: 'Johanna Prinz', role: 'owner' },
  { id: 'org_b', name: 'Reha-Zentrum Nord', role: 'coach' },
];

/**
 * The open menu.
 *
 * Queried through `aria-controls` rather than by text: the toggle's accessible
 * name contains the active workspace's name too, so a global query for it finds
 * both the button and its entry.
 */
const panel = (): HTMLElement => {
  const id = screen.getByRole('button', { name: /wechseln/ }).getAttribute('aria-controls');
  const element = id === null ? null : document.getElementById(id);
  if (element === null) throw new Error('Das Menü ist nicht geöffnet.');

  return element;
};

const renderSwitcher = (workspaces: typeof TWO, activeId = 'org_a') => {
  mocks.setActive.length = 0;
  mocks.refreshed = 0;

  return render(
    <WorkspaceSwitcher
      workspaces={workspaces}
      activeId={activeId}
      activeName={workspaces.find((w) => w.id === activeId)?.name ?? ''}
      roleLabels={ROLES}
    />,
  );
};

describe('with a single workspace', () => {
  it('is not a control at all', () => {
    // Every coach in the MVP has exactly one. A button that opens to show the
    // one option already on screen is noise.
    renderSwitcher([TWO[0]!]);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Johanna Prinz')).toBeVisible();
  });
});

describe('with several workspaces', () => {
  it('offers each one with its role', async () => {
    const user = userEvent.setup();
    renderSwitcher(TWO);

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('Reha-Zentrum Nord')).toBeVisible();
    expect(screen.getByText('Inhaber')).toBeVisible();
    expect(screen.getByText('Coach')).toBeVisible();
  });

  it('switches the active organization and re-renders the pages', async () => {
    const user = userEvent.setup();
    renderSwitcher(TWO);

    await user.click(screen.getByRole('button'));
    await user.click(within(panel()).getByRole('button', { name: /Reha-Zentrum Nord/ }));

    expect(mocks.setActive).toEqual(['org_b']);
    expect(mocks.refreshed).toBe(1);
  });

  it('does not write anything when the current one is chosen again', async () => {
    const user = userEvent.setup();
    renderSwitcher(TWO);

    await user.click(screen.getByRole('button'));
    await user.click(within(panel()).getByRole('button', { name: /Johanna Prinz/ }));

    expect(mocks.setActive).toEqual([]);
  });

  it('offers the way back to the personal level', async () => {
    // The switcher is the single place that answers "where else can I go".
    const user = userEvent.setup();
    renderSwitcher(TWO);

    await user.click(screen.getByRole('button'));

    expect(screen.getByRole('link', { name: 'Meine Übersicht' })).toHaveAttribute('href', '/start');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderSwitcher(TWO);

    await user.click(screen.getByRole('button'));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('link', { name: 'Meine Übersicht' })).toBeNull();
  });

  it('names the current workspace on the control itself', () => {
    renderSwitcher(TWO);

    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Arbeitsbereich wechseln, aktuell Johanna Prinz',
    );
  });
});
