import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SHARE_DAYS } from '@apex/domain';

import {
  ArchiveAnalysisButton,
  DeleteAnalysisButton,
  NewAnalysisButton,
} from './analysis-lifecycle';
import { AnalysisList, type AnalysisListItem } from './analysis-list';
import { ShareAnalysis } from './share-analysis';

/**
 * What the coach sees of an analysis's lifecycle.
 *
 * An analysis is finished when it has been shared. These screens have to say
 * that before it happens, ask before the step that cannot be undone, offer
 * deleting only while nothing was shared and archiving only afterwards, and
 * let a new analysis be started beside the ones that exist.
 */

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  createShare: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  archive: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock('../server/actions', () => ({
  createShareAction: mocks.createShare,
  revokeShareAction: vi.fn(() => Promise.resolve({ status: 'idle' })),
  createAnalysisAction: mocks.create,
  deleteAnalysisAction: mocks.remove,
  archiveAnalysisAction: mocks.archive,
}));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.createShare.mockResolvedValue({
    status: 'idle',
    share: {
      url: 'https://x/geteilt/t',
      expiresAt: '2026-09-23T00:00:00.000Z',
      recipient: 'a@b.de',
    },
  });
  mocks.create.mockResolvedValue({ status: 'idle', reportId: 'rep_new' });
  mocks.remove.mockResolvedValue({ status: 'idle' });
  mocks.archive.mockResolvedValue({ status: 'idle' });
});

const panel = (status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED', hasIncludedTests = true) =>
  render(
    <ShareAnalysis
      assessmentId="ass_1"
      reportId="rep_1"
      status={status}
      shares={[]}
      hasIncludedTests={hasIncludedTests}
      recipient="lena@example.org"
      mailReady
    />,
  );

describe('sharing a draft', () => {
  it('says that sharing finishes the analysis', () => {
    panel('DRAFT');

    expect(screen.getByRole('region', { name: 'Mit dem Athleten teilen' }).textContent).toMatch(
      /Mit dem Teilen ist die Auswertung abgeschlossen/u,
    );
    // There is no separate step any more.
    expect(screen.queryByRole('button', { name: /Auswertung abschließen/u })).toBeNull();
  });

  it('asks before the step that cannot be undone, and only then shares', async () => {
    const user = userEvent.setup();
    panel('DRAFT');

    await user.type(screen.getByLabelText('Passwort'), 'ein-langes-passwort');
    await user.click(screen.getByRole('button', { name: 'Teilen und abschließen' }));

    expect(mocks.createShare).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Auswertung teilen und abschließen?' });
    expect(dialog.textContent).toMatch(/nur noch archivieren/u);

    await user.click(within(dialog).getByRole('button', { name: 'Teilen und abschließen' }));

    expect(mocks.createShare).toHaveBeenCalledWith(
      'ass_1',
      'rep_1',
      DEFAULT_SHARE_DAYS,
      'ein-langes-passwort',
      '',
    );
    expect((await screen.findByRole('status')).textContent).toMatch(/lena|a@b\.de/u);
  });

  it('does not share a draft that draws on no test, and says why', () => {
    panel('DRAFT', false);

    expect(screen.getByRole('button', { name: 'Teilen und abschließen' })).toBeDisabled();
    expect(screen.getByText(/zieht keinen Test heran/u)).toBeVisible();
  });
});

describe('an analysis that has been shared', () => {
  it('offers a further link without asking again', async () => {
    const user = userEvent.setup();
    panel('PUBLISHED');

    await user.type(screen.getByLabelText('Passwort'), 'ein-langes-passwort');
    await user.click(screen.getByRole('button', { name: 'Link senden' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.createShare).toHaveBeenCalledTimes(1);
  });

  it('offers no link at all once archived', () => {
    panel('ARCHIVED');

    expect(screen.queryByLabelText('Passwort')).toBeNull();
    expect(screen.getByText(/Alle Links wurden dabei zurückgezogen/u)).toBeVisible();
  });
});

describe('starting, deleting and archiving', () => {
  it('opens the new draft straight away', async () => {
    const user = userEvent.setup();
    render(<NewAnalysisButton assessmentId="ass_1" />);

    await user.click(screen.getByRole('button', { name: 'Neue Auswertung' }));

    expect(mocks.create).toHaveBeenCalledWith('ass_1', 'Auswertung');
    expect(mocks.push).toHaveBeenCalledWith('/assessments/ass_1/auswertung/rep_new');
  });

  it('deletes a draft only after asking, and returns to the list', async () => {
    const user = userEvent.setup();
    render(<DeleteAnalysisButton assessmentId="ass_1" reportId="rep_1" />);

    await user.click(screen.getByRole('button', { name: 'Entwurf löschen' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').textContent).toMatch(/Messwerte bleiben unverändert/u);

    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }));

    expect(mocks.remove).toHaveBeenCalledWith('ass_1', 'rep_1');
    expect(mocks.push).toHaveBeenCalledWith('/assessments/ass_1/auswertung');
  });

  it('archives only after saying that the athlete loses access', async () => {
    const user = userEvent.setup();
    render(<ArchiveAnalysisButton assessmentId="ass_1" reportId="rep_1" activeShares={2} />);

    await user.click(screen.getByRole('button', { name: 'Archivieren' }));
    expect(screen.getByRole('dialog').textContent).toMatch(
      /Alle 2 aktiven Links werden zurückgezogen/u,
    );

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Archivieren' }),
    );

    expect(mocks.archive).toHaveBeenCalledWith('ass_1', 'rep_1');
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('keeps the question open and says why when it is refused', async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({
      status: 'error',
      message: 'Nur eine noch nicht geteilte Auswertung lässt sich löschen.',
    });
    render(<DeleteAnalysisButton assessmentId="ass_1" reportId="rep_1" />);

    await user.click(screen.getByRole('button', { name: 'Entwurf löschen' }));
    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/nicht geteilte/u);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('the list of analyses', () => {
  const item = (over: Partial<AnalysisListItem>): AnalysisListItem => ({
    id: 'rep_1',
    title: 'Auswertung',
    status: 'DRAFT',
    version: 1,
    createdAt: new Date('2026-09-10T10:00:00.000Z'),
    publishedAt: null,
    archivedAt: null,
    testCount: 3,
    activeShares: 0,
    ...over,
  });

  it('groups drafts, shared and archived analyses apart', () => {
    render(
      <AnalysisList
        assessmentId="ass_1"
        analyses={[
          item({ id: 'rep_3', version: 3 }),
          item({ id: 'rep_4', version: 4, testCount: 1 }),
          item({
            id: 'rep_2',
            version: 2,
            status: 'PUBLISHED',
            publishedAt: new Date('2026-09-12T10:00:00.000Z'),
            activeShares: 1,
          }),
          item({ id: 'rep_1', version: 1, status: 'ARCHIVED' }),
        ]}
      />,
    );

    const drafts = screen.getByRole('region', { name: 'In Bearbeitung' });
    expect(within(drafts).getAllByRole('link')).toHaveLength(2);
    expect(drafts.textContent).toContain('1 Test');

    const shared = screen.getByRole('region', { name: 'Geteilt' });
    expect(shared.textContent).toMatch(/Geteilt am 12\.09\.2026 · 3 Tests · 1 aktiver Link/u);

    expect(screen.getByText('1 archivierte Auswertung')).toBeVisible();
  });

  it('opens each analysis at its own address', () => {
    render(<AnalysisList assessmentId="ass_1" analyses={[item({ id: 'rep_9' })]} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/assessments/ass_1/auswertung/rep_9');
  });
});
