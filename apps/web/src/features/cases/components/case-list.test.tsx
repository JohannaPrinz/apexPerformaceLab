import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CaseList } from './case-list';

/**
 * The cases of one athlete, between the athlete and their assessments (§3).
 *
 * `CaseStatusButton` is a client component with a Server Action behind it; the
 * action is stubbed so this file can render the list, which is the part under
 * test.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../server/actions', () => ({ setCaseStatusAction: () => Promise.resolve({}) }));

const performanceCase = (over: Partial<Parameters<typeof CaseList>[0]['cases'][number]> = {}) => ({
  id: 'case_1',
  title: 'Wettkampfvorbereitung',
  description: null,
  type: 'ONGOING' as const,
  status: 'OPEN' as const,
  startedAt: new Date('2026-01-15T00:00:00.000Z'),
  endedAt: null,
  ...over,
});

describe('the case list', () => {
  it('explains in German how a case comes about when there is none', () => {
    // The empty state is where a coach learns that a case appears on its own
    // with the first assessment (§8) — it was still English.
    render(<CaseList athleteId="ath_1" cases={[]} />);

    expect(screen.getByText(/Noch kein Betreuungsfall/)).toBeVisible();
    expect(document.body.textContent).not.toContain('No case yet');
  });

  it('states the status as a word, not only as a colour', () => {
    render(<CaseList athleteId="ath_1" cases={[performanceCase({ status: 'OPEN' })]} />);

    expect(screen.getByText('Offen')).toBeVisible();
  });

  it('names an ongoing case as open rather than in English', () => {
    render(<CaseList athleteId="ath_1" cases={[performanceCase()]} />);

    expect(screen.getByText(/– offen/)).toBeVisible();
    expect(document.body.textContent).not.toContain('open<');
  });

  it('shows the end date once a case has one', () => {
    render(
      <CaseList
        athleteId="ath_1"
        cases={[performanceCase({ status: 'CLOSED', endedAt: new Date('2026-06-30') })]}
      />,
    );

    expect(screen.getByText(/15\.1\.2026 – 30\.6\.2026/)).toBeVisible();
    expect(screen.getByText('Abgeschlossen')).toBeVisible();
  });

  it('marks a single-assessment case as such', () => {
    render(<CaseList athleteId="ath_1" cases={[performanceCase({ type: 'SINGLE_ASSESSMENT' })]} />);

    expect(screen.getByText('Einzelnes Assessment')).toBeVisible();
  });

  it('offers the status control for every case', () => {
    render(
      <CaseList
        athleteId="ath_1"
        cases={[performanceCase({ id: 'a' }), performanceCase({ id: 'b' })]}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Abschließen' })).toHaveLength(2);
  });

  it('leaves no English behind', () => {
    render(<CaseList athleteId="ath_1" cases={[performanceCase({ description: 'Aufbau' })]} />);

    const text = document.body.textContent ?? '';

    for (const word of ['open', 'Close', 'Archive', 'Reopen', 'No case']) {
      expect(text).not.toContain(word);
    }
  });
});
