import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisSection, type AnalysisModuleRow, type AnalysisOverview } from './analysis-section';

/**
 * The analysis section on the assessment screen.
 *
 * What is pinned here is the **screen**: which tests it offers, which it
 * refuses and why, and what it says about an examination that is not finished.
 *
 * The two guarantees underneath it — that the workspace boundary holds and that
 * choosing a test writes nothing but the analysis row — are asserted in
 * `server/service.test.ts` against the real queries. Mocking the action here
 * would prove nothing about either, and pretending otherwise is exactly the
 * false assurance this project rules out.
 */

const mocks = vi.hoisted(() => ({
  inclusion: [] as { reportId: string; moduleId: string; included: boolean }[],
  created: [] as string[],
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('../server/actions', () => ({
  setAnalysisModuleAction: (
    _assessmentId: string,
    reportId: string,
    moduleId: string,
    included: boolean,
  ) => {
    mocks.inclusion.push({ reportId, moduleId, included });

    return Promise.resolve({ status: 'idle' });
  },
  createAnalysisAction: (assessmentId: string) => {
    mocks.created.push(assessmentId);

    return Promise.resolve({ status: 'idle' });
  },
}));

const row = (over: Partial<AnalysisModuleRow> = {}): AnalysisModuleRow => ({
  moduleId: 'mod_1',
  name: 'Laufband Mai',
  moduleKey: 'lactate',
  status: 'COMPLETED',
  archived: false,
  recorded: 16,
  expected: 16,
  level: 'COMPLETE',
  selectable: true,
  included: true,
  ...over,
});

const overview = (over: Partial<AnalysisOverview> = {}): AnalysisOverview => ({
  draft: { id: 'rep_1', title: 'Auswertung', version: 1, createdAt: new Date('2026-08-24') },
  modules: [row()],
  includedCount: 1,
  availableCount: 0,
  withoutResultsCount: 0,
  ...over,
});

const renderSection = (data: AnalysisOverview = overview(), readOnly = false) =>
  render(<AnalysisSection assessmentId="ass_1" overview={data} draft={null} readOnly={readOnly} />);

const open = () => {
  const details = document.querySelector('details');
  if (details) details.open = true;
};

beforeEach(() => {
  mocks.inclusion.length = 0;
  mocks.created.length = 0;
});

describe('what the section shows before it is opened', () => {
  it('is shut to begin with', () => {
    // The tests are what the page is about; the analysis is the step after.
    renderSection();

    expect(document.querySelector('details')?.open).toBe(false);
  });

  it('names itself and says how many tests could be drawn on', () => {
    renderSection({
      ...overview(),
      modules: [row(), row({ moduleId: 'mod_2', recorded: 0, selectable: false, included: false })],
    });

    expect(screen.getByRole('heading', { name: 'Auswertung' })).toBeVisible();
    expect(screen.getByText('1 von 2 Tests mit Ergebnissen')).toBeVisible();
  });

  it('says when no analysis has been started', () => {
    renderSection(overview({ draft: null, includedCount: 0 }));

    expect(screen.getByText('Noch keine Auswertung')).toBeVisible();
  });

  it('names the draft version where there is one', () => {
    renderSection();

    expect(screen.getByText('Entwurf · Version 1')).toBeVisible();
  });
});

describe('which tests may be drawn on', () => {
  it('offers a test that holds values', () => {
    renderSection();
    open();

    expect(screen.getByRole('checkbox', { name: /Laufband Mai/ })).toBeEnabled();
  });

  it('refuses a test nobody has recorded anything for', () => {
    renderSection(
      overview({
        modules: [row({ recorded: 0, expected: 16, selectable: false, included: false })],
        includedCount: 0,
        withoutResultsCount: 1,
      }),
    );
    open();

    expect(screen.getByRole('checkbox', { name: /Laufband Mai/ })).toBeDisabled();
  });

  it('says why rather than only greying it out', () => {
    // A control that refuses without saying why is a puzzle, and the reason is
    // knowable here.
    renderSection(
      overview({
        modules: [row({ recorded: 0, selectable: false, included: false })],
        includedCount: 0,
        withoutResultsCount: 1,
      }),
    );
    open();

    expect(screen.getByText('Noch keine Werte')).toBeVisible();
  });

  it('keeps a test without values on screen rather than hiding it', () => {
    renderSection(
      overview({
        modules: [row({ recorded: 0, selectable: false, included: false })],
        includedCount: 0,
        withoutResultsCount: 1,
      }),
    );
    open();

    expect(screen.getByText('Laufband Mai')).toBeVisible();
  });

  it('puts an archived test behind a disclosure of its own', () => {
    renderSection(
      overview({
        modules: [
          row(),
          row({ moduleId: 'mod_2', name: 'Alt', archived: true, selectable: false }),
        ],
      }),
    );
    open();

    expect(screen.getByText('1 archivierter Test einblenden')).toBeVisible();
  });

  it('never offers an archived test', () => {
    renderSection(
      overview({
        modules: [row({ name: 'Alt', archived: true, selectable: false, included: false })],
        includedCount: 0,
      }),
    );
    open();

    expect(screen.getByRole('checkbox', { name: /Alt/ })).toBeDisabled();
  });

  it('cannot be edited while there is no draft', () => {
    // There is no analysis to hold the decision yet.
    renderSection(overview({ draft: null, includedCount: 0 }));
    open();

    expect(screen.getByRole('checkbox', { name: /Laufband Mai/ })).toBeDisabled();
  });

  it('cannot be edited once the examination is closed', () => {
    renderSection(overview(), true);
    open();

    expect(screen.getByRole('checkbox', { name: /Laufband Mai/ })).toBeDisabled();
  });
});

describe('choosing what the analysis draws on', () => {
  it('sends the exclusion for this analysis and this test', async () => {
    const user = userEvent.setup();
    renderSection();
    open();

    await user.click(screen.getByRole('checkbox', { name: /Laufband Mai/ }));

    expect(mocks.inclusion).toEqual([{ reportId: 'rep_1', moduleId: 'mod_1', included: false }]);
  });

  it('sends an inclusion back the other way', async () => {
    const user = userEvent.setup();
    renderSection(overview({ modules: [row({ included: false })], includedCount: 0 }));
    open();

    await user.click(screen.getByRole('checkbox', { name: /Laufband Mai/ }));

    expect(mocks.inclusion[0]?.included).toBe(true);
  });

  it('counts what the analysis would draw on', () => {
    renderSection({
      ...overview(),
      modules: [row(), row({ moduleId: 'mod_2', name: 'Kraft', included: false })],
      includedCount: 1,
    });
    open();

    expect(screen.getByText(/1 von 2 auswertbaren Tests einbezogen/)).toBeVisible();
  });

  it('says how many tests hold nothing yet', () => {
    renderSection(
      overview({
        modules: [
          row(),
          row({ moduleId: 'mod_2', recorded: 0, selectable: false, included: false }),
        ],
        withoutResultsCount: 1,
      }),
    );
    open();

    expect(screen.getByText(/1 Test ohne Ergebnisse/)).toBeVisible();
  });
});

describe('an examination that is not finished', () => {
  const partly = () =>
    overview({
      modules: [
        row(),
        row({ moduleId: 'mod_2', name: 'Kraft', recorded: 0, selectable: false, included: false }),
      ],
      withoutResultsCount: 1,
    });

  it('says an interim analysis is possible', () => {
    renderSection(partly());
    open();

    expect(screen.getByText(/Zwischenauswertung/)).toBeVisible();
  });

  it('states it as a fact rather than warning about it', () => {
    // Whether an analysis over a partly recorded examination is worth writing
    // is the coach's call, not the screen's.
    renderSection(partly());
    open();

    const text = document.body.textContent ?? '';

    for (const word of ['Achtung', 'Warnung', 'unvollständig', 'nicht möglich', 'erst wenn']) {
      expect(text, word).not.toContain(word);
    }
  });

  it('offers to create the analysis anyway', () => {
    renderSection({ ...partly(), draft: null, includedCount: 0 });
    open();

    expect(screen.getByRole('button', { name: 'Auswertung anlegen' })).toBeEnabled();
  });

  it('says nothing about open tests where every test holds values', () => {
    renderSection();
    open();

    expect(screen.queryByText(/Zwischenauswertung/)).toBeNull();
  });
});

describe('creating the analysis', () => {
  it('happens on a deliberate click, never by opening the section', () => {
    renderSection(overview({ draft: null, includedCount: 0 }));
    open();

    expect(mocks.created).toEqual([]);
  });

  it('creates it when the coach asks', async () => {
    const user = userEvent.setup();
    renderSection(overview({ draft: null, includedCount: 0 }));
    open();

    await user.click(screen.getByRole('button', { name: 'Auswertung anlegen' }));

    expect(mocks.created).toEqual(['ass_1']);
  });

  it('refuses where no test holds anything', () => {
    renderSection(
      overview({
        draft: null,
        modules: [row({ recorded: 0, selectable: false, included: false })],
        includedCount: 0,
        withoutResultsCount: 1,
      }),
    );
    open();

    expect(screen.getByRole('button', { name: 'Auswertung anlegen' })).toBeDisabled();
  });

  it('offers nothing to create once a draft exists', () => {
    renderSection();
    open();

    expect(screen.queryByRole('button', { name: 'Auswertung anlegen' })).toBeNull();
  });
});
