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

const removeButton = () => screen.getByRole('menuitem', { name: 'Löschen' });

/**
 * Opens the tile's action menu.
 *
 * Everything but performing the test lives behind it now: four buttons in a row
 * made every card read like a form, so the card carries the information and one
 * primary action, and the rest is one click away.
 */
const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /^Aktionen:/ }));
};

/**
 * Which actions a tile offers depends on whether the test has been carried out:
 * a plan is configured and deleted, a performed test is repeated and put away.
 * A performed test is never deletable — its measurements are the record (§13).
 */
describe('the actions a tile offers', () => {
  it('keeps performing the test in the card and the rest behind the menu', async () => {
    const user = userEvent.setup();
    renderCard({ status: 'PLANNED' });

    // Nothing is shown until the menu is opened.
    expect(screen.queryByRole('menuitem', { name: 'Konfigurieren' })).toBeNull();

    await openMenu(user);

    expect(screen.getByRole('link', { name: 'Durchführen' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Konfigurieren' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Kopieren' })).toBeVisible();
    expect(removeButton()).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Test archivieren' })).toBeNull();
  });

  it('offers repeating, copying and archiving once it has been performed', async () => {
    const user = userEvent.setup();
    renderCard({ status: 'COMPLETED', measurementCount: 4 });

    await openMenu(user);

    // A button, not a link: opening a finished test again records that it was
    // reopened, and a link cannot make that write.
    expect(screen.getByRole('button', { name: 'Erneut durchführen' })).toBeVisible();

    expect(screen.getByRole('button', { name: 'Kopieren' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Test archivieren' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Löschen' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Konfigurieren' })).toBeNull();
  });

  it('counts a test holding values as performed, whatever its status says', async () => {
    // Someone entered readings into it. Offering "delete" there would offer
    // something the server refuses anyway.
    const user = userEvent.setup();
    renderCard({ status: 'IN_PROGRESS', measurementCount: 1 });

    await openMenu(user);

    expect(screen.queryByRole('menuitem', { name: 'Löschen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Test archivieren' })).toBeVisible();
  });

  it('offers to take an archived test back into the working view', async () => {
    const user = userEvent.setup();
    renderCard({ status: 'COMPLETED', measurementCount: 4, archivedAt: new Date() });

    await openMenu(user);

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

  it('leads to the entry screen, not the overview, from "Durchführen"', async () => {
    const user = userEvent.setup();
    renderCard({ status: 'PLANNED' });
    await openMenu(user);

    expect(screen.getByRole('link', { name: 'Durchführen' })).toHaveAttribute(
      'href',
      '/assessments/ass_1/tests/mod_1/run',
    );
  });

  it('keeps every action behind the menu, so the card is only information', async () => {
    const user = userEvent.setup();
    renderCard({ status: 'PLANNED' });

    // Nothing to aim at between the facts: not even performing the test.
    expect(screen.queryByRole('link', { name: 'Durchführen' })).toBeNull();

    await openMenu(user);

    expect(screen.getByRole('link', { name: 'Durchführen' })).toBeVisible();
  });
});

describe('while the assessment is being assembled', () => {
  it('offers to remove a planned test', async () => {
    const user = userEvent.setup();
    renderCard({ status: 'PLANNED' }, false);
    await openMenu(user);

    expect(removeButton()).toBeEnabled();
  });

  it('offers to remove a skipped test too', async () => {
    // Nothing has happened yet, so this is a plan being edited.
    const user = userEvent.setup();
    renderCard({ status: 'SKIPPED' }, false);
    await openMenu(user);

    expect(removeButton()).toBeEnabled();
  });
});

describe('once the examination is closed', () => {
  it('offers to remove only a skipped test', async () => {
    const user = userEvent.setup();
    renderCard({ status: 'SKIPPED' }, true);
    await openMenu(user);

    expect(removeButton()).toBeEnabled();
  });

  it('refuses a test that took place, and says why', async () => {
    // Only the states that still count as "not performed" reach the delete
    // entry at all; the others offer archiving instead.
    const user = userEvent.setup();

    for (const status of ['PLANNED', 'IN_PROGRESS'] as const) {
      const { unmount } = renderCard({ status }, true);
      await openMenu(user);

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

    await openMenu(user);
    await user.click(removeButton());

    expect(mocks.removed).toEqual([]);
    expect(screen.getByRole('alert')).toHaveTextContent('wird aus diesem Assessment entfernt');
  });

  it('names the test being removed', async () => {
    // "Are you sure?" without saying what is a dialog nobody reads.
    const user = userEvent.setup();
    renderCard({ moduleKey: 'lactate' });

    await openMenu(user);
    await user.click(removeButton());

    expect(screen.getByRole('alert')).toHaveTextContent('Laktat');
  });

  it('removes it on the second, deliberate click', async () => {
    const user = userEvent.setup();
    renderCard();

    await openMenu(user);
    await user.click(removeButton());
    await user.click(screen.getByRole('button', { name: 'Ja, entfernen' }));

    expect(mocks.removed).toEqual(['mod_1']);
  });

  it('can be called off, leaving the test in place', async () => {
    const user = userEvent.setup();
    renderCard();

    await openMenu(user);
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

    await openMenu(user);
    await user.click(screen.getByRole('button', { name: /Erneut durchführen/ }));

    expect(mocks.statusChanges).toEqual([['mod_1', 'IN_PROGRESS']]);
    expect(mocks.pushed).toEqual(['/assessments/ass_1/tests/mod_1/run']);
  });

  it('writes nothing for a test that was never finished', async () => {
    // Nothing to reopen: a plain link is the honest control.
    renderCard({ status: 'IN_PROGRESS', measurementCount: 2 });

    await openMenu(userEvent.setup());

    expect(screen.getByRole('link', { name: /Erneut durchführen/ })).toHaveAttribute(
      'href',
      '/assessments/ass_1/tests/mod_1/run',
    );
    expect(mocks.statusChanges).toEqual([]);
  });
});

/**
 * Two badges, two different questions.
 *
 * The lifecycle status says where the coach has put the test; the second badge
 * says how many of its fields hold a value. A run found them contradicting each
 * other on one tile: a test with every reading entered showed "Geplant" beside
 * a bare "vollständig", which reads as a claim about the *test* rather than
 * about its values. The status itself is untouched — it still moves only when
 * the coach says so.
 */
describe('status beside how far the values got', () => {
  /** A four-stage test with two quantities: eight fields in all. */
  const stepped = (recordedCount: number, over: Partial<ModuleCardData> = {}) =>
    renderCard({
      recordedCount,
      measurementCount: recordedCount,
      configuration: {
        measurementTypes: [
          { measurementTypeId: 'mt_1', role: 'required' },
          { measurementTypeId: 'mt_2', role: 'required' },
        ],
        exerciseIds: [],
        passes: 4,
        recordsSide: false,
        dimensions: [],
      },
      ...over,
    });

  const badges = () =>
    [...document.querySelectorAll('[data-slot="badge"]')].map((node) =>
      (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

  it('says what is complete, never just "vollständig"', () => {
    stepped(8, { status: 'PLANNED' });

    expect(badges()).toContain('vollständig erfasst');
    // The bare word was the defect: on its own it reads as a finished test.
    expect(screen.queryByText('vollständig')).toBeNull();
  });

  it('keeps a planned test planned while every value is in', () => {
    // The pair a coach reads as one sentence: "Geplant · vollständig erfasst".
    stepped(8, { status: 'PLANNED' });

    expect(badges()).toContain('Geplant');
    expect(badges()).toContain('vollständig erfasst');
  });

  it('changes no status by itself', () => {
    stepped(8, { status: 'PLANNED' });

    expect(mocks.statusChanges).toEqual([]);
    expect(screen.queryByText('Abgeschlossen')).toBeNull();
  });

  it('names the dimension on a partly filled test too', () => {
    stepped(3, { status: 'PLANNED' });

    expect(badges()).toContain('3/8 Werte erfasst');
  });

  it('keeps a readable space between the count and the words', () => {
    // The two used to be separate children spaced by CSS, which a screen
    // reader renders as "3/8Werte erfasst".
    stepped(3, { status: 'PLANNED' });

    expect(badges().some((text) => text.includes('3/8 Werte'))).toBe(true);
  });

  it('reads sensibly while the test is running', () => {
    stepped(3, { status: 'IN_PROGRESS' });

    expect(badges()).toContain('Läuft');
    expect(badges()).toContain('3/8 Werte erfasst');
  });

  it('lets a finished test say it is still missing values', () => {
    // Deliberate, not a contradiction: the coach declared it over, and what it
    // holds is what it holds.
    stepped(3, { status: 'COMPLETED' });

    expect(badges()).toContain('Abgeschlossen');
    expect(badges()).toContain('3/8 Werte erfasst');
  });

  it('reads sensibly on a finished and fully recorded test', () => {
    stepped(8, { status: 'COMPLETED' });

    expect(badges()).toContain('Abgeschlossen');
    expect(badges()).toContain('vollständig erfasst');
  });

  it('reads sensibly on a skipped test', () => {
    stepped(0, { status: 'SKIPPED' });

    expect(badges()).toContain('Übersprungen');
    expect(badges()).toContain('0/8 Werte erfasst');
  });

  it('reads sensibly on an abandoned test', () => {
    stepped(3, { status: 'ABORTED' });

    expect(badges()).toContain('Abgebrochen');
    expect(badges()).toContain('3/8 Werte erfasst');
  });

  it('claims nothing where the configuration cannot be read', () => {
    // No expected number, so "0 von 0" would be a claim rather than a fact.
    renderCard({ configuration: null, status: 'PLANNED' });

    expect(badges()).toContain('Geplant');
    expect(badges().some((text) => text.includes('erfasst'))).toBe(false);
  });
});
