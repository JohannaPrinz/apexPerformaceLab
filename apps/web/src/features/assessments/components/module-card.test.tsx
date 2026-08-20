import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ModuleCard, type ModuleCardData } from './module-card';

/**
 * Removing a test is the one destructive action on this screen, so what is
 * asserted here is when it is offered, when it is refused, and that it never
 * happens on a single click.
 *
 * The rule itself lives in `@apex/domain` and is tested there; the card only
 * decides what to show. The server refuses regardless — a rule that lives in a
 * button is not a rule.
 */

const mocks = vi.hoisted(() => ({ removed: [] as string[] }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../server/actions', () => ({
  removeModuleAction: (moduleId: string) => {
    mocks.removed.push(moduleId);

    return Promise.resolve({});
  },
}));

const moduleData = (over: Partial<ModuleCardData> = {}): ModuleCardData => ({
  id: 'mod_1',
  name: 'Laufen – Laktat',
  moduleKey: 'lactate',
  moduleVersion: 1,
  status: 'PLANNED',
  measurementCount: 0,
  configuration: {
    measurementTypes: [{ measurementTypeId: 'mt_1', role: 'required' }],
    exerciseIds: [],
    passes: 1,
    recordsSide: false,
    dimensions: [],
  },
  ...over,
});

const renderCard = (over: Partial<ModuleCardData> = {}, assessmentBegun = false) => {
  mocks.removed.length = 0;

  return render(
    <ModuleCard
      module={moduleData(over)}
      assessmentId="ass_1"
      typeNames={{ mt_1: 'Laktat' }}
      exerciseNames={{}}
      copyTargets={[]}
      assessmentBegun={assessmentBegun}
    />,
  );
};

const removeButton = () => screen.getByRole('button', { name: 'Entfernen' });

describe('while the assessment is being assembled', () => {
  it('offers to remove a planned test', () => {
    renderCard({ status: 'PLANNED' }, false);

    expect(removeButton()).toBeEnabled();
  });

  it('offers to remove a skipped test too', () => {
    // Nothing has happened yet, so this is a plan being edited.
    renderCard({ status: 'SKIPPED' }, false);

    expect(removeButton()).toBeEnabled();
  });
});

describe('once the assessment has been performed', () => {
  it('offers to remove only a skipped test', () => {
    renderCard({ status: 'SKIPPED' }, true);

    expect(removeButton()).toBeEnabled();
  });

  it('refuses a test that took place, and says why', () => {
    for (const status of ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ABORTED'] as const) {
      const { unmount } = renderCard({ status }, true);

      expect(removeButton()).toBeDisabled();
      expect(removeButton()).toHaveAttribute(
        'title',
        expect.stringContaining('bereits durchgeführt'),
      );
      unmount();
    }
  });

  it('refuses a test holding measurements, whatever its status', () => {
    // §13: a measurement is never deleted. This outranks the skipped case.
    renderCard({ status: 'SKIPPED', measurementCount: 2 }, true);

    expect(removeButton()).toBeDisabled();
    expect(removeButton()).toHaveAttribute('title', expect.stringContaining('Messwerte'));
  });
});

describe('the confirmation', () => {
  it('does not remove anything on the first click', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(removeButton());

    expect(mocks.removed).toEqual([]);
    expect(screen.getByRole('alert')).toHaveTextContent('wird aus diesem Assessment entfernt');
  });

  it('names the test being removed', async () => {
    // "Are you sure?" without saying what is a dialog nobody reads.
    const user = userEvent.setup();
    renderCard({ moduleKey: 'lactate' });

    await user.click(removeButton());

    expect(screen.getByRole('alert')).toHaveTextContent('Laktat');
  });

  it('removes it on the second, deliberate click', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(removeButton());
    await user.click(screen.getByRole('button', { name: 'Ja, entfernen' }));

    expect(mocks.removed).toEqual(['mod_1']);
  });

  it('can be called off, leaving the test in place', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(removeButton());
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(mocks.removed).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/**
 * A test is identified by its name, not by its type.
 *
 * Three tests of one type in one assessment is the case the schema used to
 * forbid, and the card is where a coach tells them apart.
 */
describe('naming a test on the card', () => {
  it('leads with the name and keeps the type beside it', () => {
    renderCard({ name: 'Laufen – Sprint', moduleKey: 'running' });

    expect(screen.getByText('Laufen – Sprint')).toBeVisible();
    expect(screen.getByText('Laufen')).toBeVisible();
  });

  it('falls back to the type for a test written before names existed', () => {
    // Existing rows carry no name and must still read sensibly.
    renderCard({ name: null, moduleKey: 'running' });

    expect(screen.getByText('Laufen')).toBeVisible();
  });

  it('tells three tests of one type apart', () => {
    for (const name of ['Laufen – Laktat', 'Laufen – Sprint', 'Laufen – Ausdauer']) {
      const { unmount } = renderCard({ name, moduleKey: 'running' });

      expect(screen.getByText(name)).toBeVisible();
      unmount();
    }
  });
});
