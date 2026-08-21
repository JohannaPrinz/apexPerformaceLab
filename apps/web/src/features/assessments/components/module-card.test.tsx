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

const mocks = vi.hoisted(() => ({
  removed: [] as string[],
  statusChanges: [] as [string, string][],
  pushed: [] as string[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: (href: string) => mocks.pushed.push(href),
  }),
}));
vi.mock('../measurements/server/actions', () => ({
  setModuleStatusAction: (moduleId: string, status: string) => {
    mocks.statusChanges.push([moduleId, status]);

    return Promise.resolve({});
  },
}));
vi.mock('../server/actions', () => ({
  removeModuleAction: (moduleId: string) => {
    mocks.removed.push(moduleId);

    return Promise.resolve({});
  },
  updateModuleAction: () => Promise.resolve({}),
  setModuleArchivedAction: () => Promise.resolve({}),
}));

const moduleData = (over: Partial<ModuleCardData> = {}): ModuleCardData => ({
  id: 'mod_1',
  name: 'Laufen – Laktat',
  moduleKey: 'lactate',
  moduleVersion: 1,
  description: null,
  status: 'PLANNED',
  measurementCount: 0,
  recordedCount: 0,
  lastRecordedAt: null,
  completedAt: null,
  reopenedAt: null,
  archivedAt: null,
  configuration: {
    measurementTypes: [{ measurementTypeId: 'mt_1', role: 'required' }],
    exerciseIds: [],
    passes: 1,
    recordsSide: false,
    dimensions: [],
  },
  ...over,
});

const renderCard = (over: Partial<ModuleCardData> = {}, assessmentClosed = false) => {
  mocks.removed.length = 0;
  mocks.statusChanges.length = 0;
  mocks.pushed.length = 0;

  return render(
    <ModuleCard
      module={moduleData(over)}
      assessmentId="ass_1"
      typeNames={{ mt_1: 'Laktat' }}
      exerciseNames={{}}
      copyTargets={[]}
      assessmentClosed={assessmentClosed}
    />,
  );
};

const removeButton = () => screen.getByRole('button', { name: 'Löschen' });

/**
 * Which actions a tile offers depends on whether the test has been carried out:
 * a plan is configured and deleted, a performed test is repeated and put away.
 * A performed test is never deletable — its measurements are the record (§13).
 */
describe('the actions a tile offers', () => {
  it('offers configuring, copying and deleting while the test is only planned', () => {
    renderCard({ status: 'PLANNED' });

    expect(screen.getByRole('link', { name: 'Durchführen' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Konfigurieren' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Kopieren' })).toBeVisible();
    expect(removeButton()).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Test archivieren' })).toBeNull();
  });

  it('offers repeating, copying and archiving once it has been performed', () => {
    renderCard({ status: 'COMPLETED', measurementCount: 4 });

    // A button, not a link: opening a finished test again records that it was
    // reopened, and a link cannot make that write.
    expect(screen.getByRole('button', { name: 'Erneut durchführen' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Kopieren' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Test archivieren' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Löschen' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Konfigurieren' })).toBeNull();
  });

  it('counts a test holding values as performed, whatever its status says', () => {
    // Someone entered readings into it. Offering "delete" there would offer
    // something the server refuses anyway.
    renderCard({ status: 'IN_PROGRESS', measurementCount: 1 });

    expect(screen.queryByRole('button', { name: 'Löschen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Test archivieren' })).toBeVisible();
  });

  it('offers to take an archived test back into the working view', () => {
    renderCard({ status: 'COMPLETED', measurementCount: 4, archivedAt: new Date() });

    expect(screen.getByRole('button', { name: 'Test wieder aufnehmen' })).toBeVisible();
  });

  it('has no edit button — the test is opened and edited there', () => {
    renderCard();

    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).toBeNull();
  });

  it('opens the test through its name', () => {
    renderCard({ name: 'Sprint 2' });

    expect(screen.getByRole('link', { name: 'Sprint 2' })).toHaveAttribute(
      'href',
      '/assessments/ass_1/tests/mod_1',
    );
  });

  it('leads to the entry screen, not the overview, from "Durchführen"', () => {
    renderCard({ status: 'PLANNED' });

    expect(screen.getByRole('link', { name: 'Durchführen' })).toHaveAttribute(
      'href',
      '/assessments/ass_1/tests/mod_1/run',
    );
  });

  it('puts the primary action last, so it sits on the right', () => {
    renderCard({ status: 'PLANNED' });

    // Last in the DOM is rightmost in a left-to-right row, and last in the
    // stack when it wraps — which on a phone is closest to the thumb.
    const run = screen.getByRole('link', { name: 'Durchführen' });
    const row = run.closest('div.flex.flex-wrap');
    const labels = [...(row?.children ?? [])].map((child) => child.textContent?.trim());

    expect(labels.at(-1)).toBe('Durchführen');
  });
});

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

describe('once the examination is closed', () => {
  it('offers to remove only a skipped test', () => {
    renderCard({ status: 'SKIPPED' }, true);

    expect(removeButton()).toBeEnabled();
  });

  it('refuses a test that took place, and says why', () => {
    // Only the states that still count as "not performed" reach the delete
    // button at all; the others offer archiving instead.
    for (const status of ['PLANNED', 'IN_PROGRESS'] as const) {
      const { unmount } = renderCard({ status }, true);

      expect(removeButton()).toBeDisabled();
      expect(removeButton()).toHaveAttribute('title', expect.stringContaining('abgeschlossen'));
      unmount();
    }
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

/**
 * Re-running a finished test from the tile.
 *
 * The critical part is that it is not a link. Opening a completed test again
 * has to record that it was reopened — without `reopenedAt` the test is
 * `IN_PROGRESS` and indistinguishable from one that was never finished, and
 * everything the overview says about changes made after the fact falls over.
 */
describe('re-running from the tile', () => {
  it('records the reopening before it navigates', async () => {
    const user = userEvent.setup();
    renderCard({ status: 'COMPLETED', measurementCount: 4 });

    await user.click(screen.getByRole('button', { name: /Erneut durchführen/ }));

    expect(mocks.statusChanges).toEqual([['mod_1', 'IN_PROGRESS']]);
    expect(mocks.pushed).toEqual(['/assessments/ass_1/tests/mod_1/run']);
  });

  it('writes nothing for a test that was never finished', () => {
    // Nothing to reopen: a plain link is the honest control.
    renderCard({ status: 'IN_PROGRESS', measurementCount: 2 });

    expect(screen.getByRole('link', { name: /Erneut durchführen/ })).toHaveAttribute(
      'href',
      '/assessments/ass_1/tests/mod_1/run',
    );
    expect(mocks.statusChanges).toEqual([]);
  });
});
