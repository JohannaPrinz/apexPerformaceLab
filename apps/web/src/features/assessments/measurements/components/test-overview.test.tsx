import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModuleConfiguration } from '@apex/domain';

import { TestOverview } from './test-overview';

/**
 * The screen a tile opens: what a test is, what it holds, and when it happened.
 *
 * What is pinned here is the division of labour. This screen *reads* — the one
 * thing it changes is what the coach called the test and wrote about it. Values
 * are entered behind "Durchführen", and a finished test that is opened again
 * has to say so, because "changed after completion" is read off that.
 */

const push = vi.fn();
const setModuleStatusAction = vi.fn<(moduleId: string, status: string) => Promise<unknown>>();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('../server/actions', () => ({
  setModuleStatusAction: (moduleId: string, status: string) =>
    setModuleStatusAction(moduleId, status),
}));
vi.mock('../../server/actions', () => ({
  updateModuleAction: () => Promise.resolve({}),
  setModuleArchivedAction: () => Promise.resolve({}),
}));

beforeEach(() => {
  push.mockReset();
  setModuleStatusAction.mockReset();
  setModuleStatusAction.mockResolvedValue({});
});

const configuration = (over: Partial<ModuleConfiguration> = {}): ModuleConfiguration => ({
  measurementTypes: [{ measurementTypeId: 'mt_rom', role: 'required' }],
  exerciseIds: [],
  passes: 2,
  recordsSide: false,
  dimensions: [],
  ...over,
});

const recorded = (over: Record<string, unknown> = {}) => ({
  id: 'meas_1',
  measurementTypeId: 'mt_rom',
  side: 'BILATERAL',
  exerciseId: null,
  passIndex: 1,
  context: {},
  numericValue: '42',
  textValue: null,
  booleanValue: null,
  note: null,
  ...over,
});

const READINESS: Parameters<typeof TestOverview>[0]['readiness'] = {
  level: 'PARTIAL',
  missingPasses: [2],
  missingTypeIds: [],
  missingRecommendedTypeIds: [],
  expected: 2,
  recorded: 1,
};

/** The moments block, so the status badges do not answer for it. */
const history = () => screen.getByRole('region', { name: 'Zeitpunkte' });

const renderOverview = (over: Partial<Parameters<typeof TestOverview>[0]> = {}) =>
  render(
    <TestOverview
      moduleId="mod_1"
      assessmentId="ass_1"
      moduleKey="mobility"
      moduleName="Sprungkraft – beidbeinig"
      moduleDescription="Freigabe für Sprungbelastung."
      status="COMPLETED"
      configuration={configuration()}
      types={{ mt_rom: { name: 'Beweglichkeit', unit: '°', valueType: 'NUMERIC' } }}
      exercises={{}}
      measurements={[recorded()]}
      notes={[]}
      readiness={READINESS}
      createdAt={new Date('2026-08-20T09:00:00Z')}
      completedAt={new Date('2026-08-21T08:00:00Z')}
      reopenedAt={null}
      archivedAt={null}
      charts={[]}
      derived={[]}
      nextModule={null}
      {...over}
    />,
  );

describe('what the overview says about the test', () => {
  it('names when it was set up and when it was finished', () => {
    renderOverview();

    // Scoped to the history: "Abgeschlossen" is also the status badge, and the
    // row is the one under test.
    expect(within(history()).getByText('Angelegt')).toBeVisible();
    expect(within(history()).getByText('Abgeschlossen')).toBeVisible();
  });

  it('says when it was reopened, once it was', () => {
    renderOverview({ reopenedAt: new Date('2026-08-21T09:00:00Z') });

    expect(within(history()).getByText('Wieder geöffnet')).toBeVisible();
  });

  it('stays quiet about a reopening that never happened', () => {
    renderOverview();

    expect(within(history()).queryByText('Wieder geöffnet')).toBeNull();
  });

  it('lists the values stage by stage', () => {
    renderOverview();

    expect(screen.getByText('Stufe 1')).toBeVisible();
    expect(screen.getByText('Stufe 2')).toBeVisible();
    expect(screen.getByText(/42/)).toBeVisible();
  });

  it('says which value is missing rather than leaving a blank', () => {
    renderOverview();

    expect(screen.getByText('nicht erfasst')).toBeVisible();
  });

  it('marks a corrected value in colour', () => {
    renderOverview({ measurements: [recorded({ supersedes: { id: 'meas_old' } })] });

    expect(screen.getByText('korrigiert')).toBeVisible();
  });

  it('warns that values were entered after the test was finished', () => {
    renderOverview({
      measurements: [recorded({ ingestedAt: new Date('2026-08-21T10:00:00Z') })],
    });

    expect(screen.getByText(/Nach dem Abschluss wurden Werte geändert/)).toBeVisible();
  });

  it('does not warn about values entered during the test', () => {
    renderOverview({
      measurements: [recorded({ ingestedAt: new Date('2026-08-21T07:00:00Z') })],
    });

    expect(screen.queryByText(/Nach dem Abschluss/)).toBeNull();
  });

  it('shows a stage note beside its stage', () => {
    renderOverview({ notes: [{ id: 'n1', body: 'Bei Stufe 1 Beschwerden', passIndex: 1 }] });

    expect(screen.getByText('Bei Stufe 1 Beschwerden')).toBeVisible();
  });
});

describe('what the overview lets a coach do', () => {
  it('offers no way to finish a test — that belongs to the run', () => {
    // The coach arrives here *because* the test is finished. A button saying
    // "Test abschließen" on a completed test is an action with nothing to do.
    renderOverview();

    expect(screen.queryByRole('button', { name: /Test abschließen/ })).toBeNull();
  });

  it('edits the name and description, and nothing else', () => {
    renderOverview();

    expect(screen.getAllByRole('button', { name: 'Bearbeiten' })).not.toHaveLength(0);
    expect(screen.queryByLabelText(/^Beweglichkeit/)).toBeNull();
  });

  it('records the reopening before it opens a finished test again', async () => {
    // Without this, `reopenedAt` never gets set and "changed after completion"
    // has nothing to stand on.
    const user = userEvent.setup();
    renderOverview({ status: 'COMPLETED' });

    await user.click(screen.getAllByRole('button', { name: /Erneut durchführen/ })[0]!);

    expect(setModuleStatusAction).toHaveBeenCalledWith('mod_1', 'IN_PROGRESS');
    expect(push).toHaveBeenCalledWith('/assessments/ass_1/tests/mod_1/run');
  });

  it('writes nothing when a test that was never finished is opened', () => {
    renderOverview({ status: 'PLANNED', measurements: [], completedAt: null });

    const run = screen.getAllByRole('link', { name: 'Durchführen' })[0];

    expect(run).toHaveAttribute('href', '/assessments/ass_1/tests/mod_1/run');
    expect(setModuleStatusAction).not.toHaveBeenCalled();
  });

  it('offers archiving, and says so when the test is already archived', () => {
    renderOverview({ archivedAt: new Date('2026-08-21T11:00:00Z') });

    expect(screen.getByRole('button', { name: 'Test wieder aufnehmen' })).toBeVisible();
    expect(within(history()).getByText('Archiviert')).toBeVisible();
  });
});

/**
 * The percentage a caliper test computes for itself.
 *
 * The absence is as much a result as the number: a coach who has taken every
 * fold and sees nothing needs to be told the gap is a date of birth on the
 * athlete record, not another fold.
 */
describe('the values the test computed', () => {
  const derivedTypes = {
    mt_body_fat: { name: 'Körperfettanteil', unit: '%', valueType: 'NUMERIC' },
  };

  const computed = (over: Record<string, unknown> = {}) => ({
    measurementTypeId: 'mt_body_fat',
    method: 'jackson_pollock_3',
    value: 17.3,
    inputs: 'Jackson & Pollock, 3 Punkte · Faltensumme 52 mm · Alter 36',
    refusal: null,
    storedValue: 17.3,
    measuredAt: new Date('2026-01-01T09:00:00Z'),
    ...over,
  });

  const section = () => screen.getByRole('region', { name: 'Berechnete Werte' });

  it('shows nothing at all for a test that computes nothing', () => {
    renderOverview();

    expect(screen.queryByRole('region', { name: 'Berechnete Werte' })).toBeNull();
  });

  it('states the percentage and the method it came from', () => {
    renderOverview({ types: derivedTypes, derived: [computed()] });

    expect(within(section()).getByText(/17,3/)).toBeVisible();
    expect(within(section()).getByText('Jackson & Pollock, 3 Punkte')).toBeVisible();
  });

  it('states the two inputs that cannot be read off the folds', () => {
    // The sum and the age on the day: what the equation actually consumed.
    renderOverview({ types: derivedTypes, derived: [computed()] });

    expect(within(section()).getByText(/Faltensumme 52 mm/)).toBeVisible();
    expect(within(section()).getByText(/Alter 36/)).toBeVisible();
  });

  it('says a missing sex is the reason, not a missing fold', () => {
    renderOverview({
      types: derivedTypes,
      derived: [computed({ value: null, inputs: null, refusal: { reason: 'SEX_NOT_SPECIFIED' } })],
    });

    expect(within(section()).getByText(/kein Geschlecht hinterlegt/)).toBeVisible();
  });

  it('says a missing date of birth is the reason', () => {
    renderOverview({
      types: derivedTypes,
      derived: [computed({ value: null, refusal: { reason: 'DATE_OF_BIRTH_MISSING' } })],
    });

    expect(within(section()).getByText(/kein Geburtsdatum hinterlegt/)).toBeVisible();
  });

  it('names the folds it is waiting for, in German', () => {
    renderOverview({
      types: derivedTypes,
      derived: [
        computed({
          value: null,
          refusal: { reason: 'SITES_MISSING', missing: ['skinfold_abdomen', 'skinfold_thigh'] },
        }),
      ],
    });

    expect(within(section()).getByText(/Abdomen, Oberschenkel/)).toBeVisible();
  });

  it('never calls the percentage good or bad', () => {
    // The record holds no direction for body fat, so a number is a number.
    renderOverview({ types: derivedTypes, derived: [computed()] });

    const text = section().textContent ?? '';

    for (const word of ['gut', 'schlecht', 'optimal', 'Norm', 'Ziel', 'zu hoch', 'ideal']) {
      expect(text, word).not.toContain(word);
    }
  });

  it('shows the number without a field to type it into', () => {
    // A derived quantity is computed, never entered — a box beside it would
    // invite a coach to disagree with the method.
    renderOverview({ types: derivedTypes, derived: [computed()] });

    expect(within(section()).queryByRole('textbox')).toBeNull();
    expect(within(section()).queryByRole('spinbutton')).toBeNull();
  });

  it('keeps a percentage already in the record visible when it cannot be recomputed', () => {
    // A profile that has since lost its date of birth does not erase a finding.
    renderOverview({
      types: derivedTypes,
      derived: [
        computed({
          value: null,
          inputs: null,
          storedValue: 18.6,
          refusal: { reason: 'SEX_NOT_SPECIFIED' },
        }),
      ],
    });

    expect(within(section()).getByText(/18,6/)).toBeVisible();
    expect(within(section()).getByText(/Früher berechnet/)).toBeVisible();
    expect(within(section()).getByText(/kein Geschlecht hinterlegt/)).toBeVisible();
  });

  it('shows only the reason where nothing was ever computed', () => {
    renderOverview({
      types: derivedTypes,
      derived: [
        computed({
          value: null,
          storedValue: null,
          refusal: { reason: 'SITES_MISSING', missing: ['skinfold_thigh'] },
        }),
      ],
    });

    expect(within(section()).queryByText(/Früher berechnet/)).toBeNull();
    expect(within(section()).getByText(/Oberschenkel/)).toBeVisible();
  });
});
