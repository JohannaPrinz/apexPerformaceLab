import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CaseSection, NoCases } from './case-section';

/**
 * The engagement and the assessments inside it.
 *
 * What is asserted here is the hierarchy §3 describes — an assessment sits
 * *inside* a case, not beside it — and the wording a coach reads. The two
 * dialogs are client components with server actions behind them; the actions are
 * stubbed so this file can render the section, which is the part under test.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../server/actions', () => ({
  setCaseStatusAction: () => Promise.resolve({}),
  createCaseAction: () => Promise.resolve({}),
  updateCaseAction: () => Promise.resolve({}),
}));
vi.mock('@/features/assessments', () => ({
  CreateAssessmentDialog: () => <button type="button">Assessment anlegen</button>,
}));

const performanceCase = (
  over: Partial<Parameters<typeof CaseSection>[0]['performanceCase']> = {},
) => ({
  id: 'case_1',
  title: 'Wettkampfvorbereitung',
  description: null,
  type: 'ONGOING' as const,
  status: 'OPEN' as const,
  startedAt: new Date('2026-01-15T00:00:00.000Z'),
  endedAt: null,
  ...over,
});

const assessment = (
  over: Partial<Parameters<typeof CaseSection>[0]['assessments'][number]> = {},
) => ({
  id: 'as_1',
  question: 'Wo liegt die aerobe Schwelle?',
  type: 'INITIAL',
  performedAt: new Date('2026-03-17T00:00:00.000Z'),
  testCount: 3,
  ...over,
});

const renderSection = (
  cases = performanceCase(),
  assessments: Parameters<typeof CaseSection>[0]['assessments'] = [],
) => render(<CaseSection performanceCase={cases} assessments={assessments} athleteId="ath_1" />);

describe('the engagement', () => {
  it('states its status as a word, not only as a colour', () => {
    renderSection(performanceCase({ status: 'OPEN' }));

    expect(screen.getByText('Offen')).toBeVisible();
  });

  it('says an ongoing engagement is open, in German', () => {
    renderSection();

    expect(screen.getByText(/– offen/)).toBeVisible();
    expect(document.body.textContent).not.toContain('open');
  });

  it('shows the end date once there is one', () => {
    renderSection(performanceCase({ status: 'CLOSED', endedAt: new Date('2026-06-30') }));

    expect(screen.getByText(/15\.1\.2026 – 30\.6\.2026/)).toBeVisible();
    expect(screen.getByText('Abgeschlossen')).toBeVisible();
  });

  it('offers editing and the status change side by side', () => {
    // Correcting a title and closing an engagement are different acts; an
    // ordinary edit must not be able to close one by accident.
    renderSection();

    expect(screen.getByRole('button', { name: /Bearbeiten/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abschließen' })).toBeInTheDocument();
  });
});

describe('the assessments inside it', () => {
  it('nests them under the engagement rather than beside it', () => {
    // §3: Athlete → Performance Case → Assessment. Two flat lists made that
    // invisible, which is what this replaced.
    const { container } = renderSection(performanceCase(), [assessment()]);

    const article = container.querySelector('article');
    expect(article).not.toBeNull();
    expect(within(article!).getByRole('link', { name: /aerobe Schwelle/ })).toHaveAttribute(
      'href',
      '/assessments/as_1',
    );
  });

  it('counts the tests, in the singular where that is right', () => {
    renderSection(performanceCase(), [assessment({ testCount: 1 })]);

    expect(screen.getByText(/1 Test$/)).toBeVisible();
  });

  it('says so when the engagement holds none yet', () => {
    renderSection();

    expect(screen.getByText('Noch kein Assessment in diesem Betreuungsfall.')).toBeVisible();
  });

  it('offers to add one from inside the engagement', () => {
    // The button sits in the case, which is how the dialog knows which one it
    // belongs to without asking.
    renderSection();

    expect(screen.getByRole('button', { name: 'Assessment anlegen' })).toBeVisible();
  });
});

describe('an athlete with no engagement at all', () => {
  it('explains what a case is for instead of showing an empty list', () => {
    render(
      <NoCases>
        <button type="button">Betreuungsfall anlegen</button>
      </NoCases>,
    );

    expect(screen.getByText('Noch kein Betreuungsfall angelegt.')).toBeVisible();
    expect(screen.getByText(/bündelt die Assessments/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Betreuungsfall anlegen' })).toBeVisible();
  });
});
