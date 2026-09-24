import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCallerFactory, createTRPCRouter } from '@/server/api/trpc';

import type * as Service from './service';

type ServiceModule = typeof Service;

/**
 * Sharing is what finishes an analysis — the order of it, through the real
 * procedure.
 *
 * The services are replaced here, because what is under test is the sequence
 * the procedure runs: a draft is frozen **before** the link exists, a failed
 * link takes the freeze back, a shared analysis gets a further link without a
 * second freeze, an archived one gets none, and the working stills are only
 * cleared once no other draft of the assessment could be using them.
 */

const mocks = vi.hoisted(() => ({
  reportStatus: vi.fn(),
  evaluationForReport: vi.fn(),
  publishReport: vi.fn(),
  reopenUnsharedReport: vi.fn(),
  otherOpenDrafts: vi.fn(),
  deleteDraftReport: vi.fn(),
  archiveReport: vi.fn(),
  createReportShare: vi.fn(),
  freezeReportMedia: vi.fn(),
  discardAnalysisStills: vi.fn(),
  events: [] as string[],
}));

vi.mock('@apex/database', () => ({ db: {} }));
vi.mock('@apex/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

vi.mock('@/features/assessments', () => ({
  MODULE_LABELS_DE: {},
  chartsForTests: vi.fn(() => new Map()),
  measurementCharts: vi.fn(() => Promise.resolve(new Map())),
}));

vi.mock('./media', () => ({
  analysisStillsFor: vi.fn(),
  analysisStillTests: vi.fn(),
  freezeReportMedia: mocks.freezeReportMedia,
  discardAnalysisStills: mocks.discardAnalysisStills,
  sweepAnalysisStills: vi.fn(),
}));

vi.mock('./sharing', () => ({
  createReportShare: mocks.createReportShare,
  revokeShare: vi.fn(),
  sharedAssessmentIds: vi.fn(),
  sharesForReport: vi.fn(),
}));

vi.mock('./service', async (original) => ({
  ...(await original<ServiceModule>()),
  reportStatus: mocks.reportStatus,
  evaluationForReport: mocks.evaluationForReport,
  publishReport: mocks.publishReport,
  reopenUnsharedReport: mocks.reopenUnsharedReport,
  otherOpenDrafts: mocks.otherOpenDrafts,
  deleteDraftReport: mocks.deleteDraftReport,
  archiveReport: mocks.archiveReport,
}));

const { reportsRouter } = await import('./router');

const caller = createCallerFactory(createTRPCRouter({ reports: reportsRouter }))({
  db: {
    membership: { findUnique: vi.fn(() => Promise.resolve({ role: 'coach' })) },
    coach: { findUnique: vi.fn(() => Promise.resolve({ id: 'coach_1' })) },
  },
  headers: new Headers(),
  session: {
    user: { id: 'usr_coach', name: 'Coach', email: 'coach@example.org' },
    session: { activeOrganizationId: 'org_a' },
  },
  perRequest: <T>(_key: string, read: () => Promise<T>) => read(),
} as never).reports;

const SHARE_INPUT = { reportId: 'rep_1', days: 7, password: 'ein-langes-passwort' };
const SHARE = {
  id: 'shr_1',
  token: 't',
  password: 'x',
  expiresAt: new Date(),
  recipient: 'a@b.de',
};

const note = (name: string, value: unknown) => () => {
  mocks.events.push(name);

  return Promise.resolve(value);
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    if (typeof mock === 'function') mock.mockReset();
  }
  mocks.events.length = 0;

  mocks.evaluationForReport.mockImplementation(
    note('evaluate', {
      modules: [
        { moduleId: 'mod_1', included: true },
        { moduleId: 'mod_2', included: false },
      ],
    }),
  );
  mocks.freezeReportMedia.mockImplementation(note('copy stills', new Map()));
  mocks.publishReport.mockImplementation(note('freeze', { ok: true }));
  mocks.createReportShare.mockImplementation(note('create link', SHARE));
  mocks.reopenUnsharedReport.mockImplementation(note('reopen', true));
  mocks.otherOpenDrafts.mockImplementation(note('other drafts?', 0));
  mocks.discardAnalysisStills.mockImplementation(note('clear stills', 0));
});

describe('sharing a draft', () => {
  it('freezes it first and creates the link second', async () => {
    mocks.reportStatus.mockResolvedValue({ status: 'DRAFT', assessmentId: 'ass_1' });

    expect(await caller.createShare(SHARE_INPUT)).toEqual(SHARE);
    expect(mocks.events).toEqual([
      'evaluate',
      'copy stills',
      'freeze',
      'create link',
      'other drafts?',
      'clear stills',
    ]);
    // Only the stills of the tests the document drew on.
    expect(mocks.discardAnalysisStills).toHaveBeenCalledWith(expect.anything(), ['mod_1']);
  });

  it('leaves the working stills where another draft of the assessment is still open', async () => {
    mocks.reportStatus.mockResolvedValue({ status: 'DRAFT', assessmentId: 'ass_1' });
    mocks.otherOpenDrafts.mockImplementation(note('other drafts?', 1));

    await caller.createShare(SHARE_INPUT);

    expect(mocks.discardAnalysisStills).not.toHaveBeenCalled();
  });

  it('takes the freeze back when no link could be created', async () => {
    mocks.reportStatus.mockResolvedValue({ status: 'DRAFT', assessmentId: 'ass_1' });
    mocks.createReportShare.mockImplementation(note('create link', null));

    await expect(caller.createShare(SHARE_INPUT)).rejects.toThrow(/not found/iu);
    expect(mocks.events).toContain('reopen');
    expect(mocks.discardAnalysisStills).not.toHaveBeenCalled();
  });

  it('takes the freeze back when creating the link throws', async () => {
    mocks.reportStatus.mockResolvedValue({ status: 'DRAFT', assessmentId: 'ass_1' });
    mocks.createReportShare.mockRejectedValue(new Error('database unavailable'));

    await expect(caller.createShare(SHARE_INPUT)).rejects.toThrow(/database unavailable/u);
    expect(mocks.reopenUnsharedReport).toHaveBeenCalledTimes(1);
  });

  it('refuses a draft that draws on no test, and creates no link', async () => {
    mocks.reportStatus.mockResolvedValue({ status: 'DRAFT', assessmentId: 'ass_1' });
    mocks.publishReport.mockImplementation(note('freeze', { ok: false, reason: 'EMPTY' }));

    await expect(caller.createShare(SHARE_INPUT)).rejects.toThrow(/keinen Test/u);
    expect(mocks.createReportShare).not.toHaveBeenCalled();
  });
});

describe('sharing an analysis that is already shared or archived', () => {
  it('adds a link to a shared analysis without freezing it again', async () => {
    mocks.reportStatus.mockResolvedValue({ status: 'PUBLISHED', assessmentId: 'ass_1' });

    expect(await caller.createShare(SHARE_INPUT)).toEqual(SHARE);
    expect(mocks.events).toEqual(['create link']);
  });

  it('refuses an archived analysis', async () => {
    mocks.reportStatus.mockResolvedValue({ status: 'ARCHIVED', assessmentId: 'ass_1' });

    await expect(caller.createShare(SHARE_INPUT)).rejects.toThrow(/archiviert/u);
    expect(mocks.createReportShare).not.toHaveBeenCalled();
  });
});

describe('deleting and archiving', () => {
  it('says why a shared analysis cannot be deleted', async () => {
    mocks.deleteDraftReport.mockResolvedValue(false);

    await expect(caller.deleteDraft({ reportId: 'rep_1' })).rejects.toThrow(/nicht geteilte/u);
  });

  it('says why a draft cannot be archived', async () => {
    mocks.archiveReport.mockResolvedValue(false);

    await expect(caller.archive({ reportId: 'rep_1' })).rejects.toThrow(/geteilte Auswertung/u);
  });

  it('confirms both where they succeed', async () => {
    mocks.deleteDraftReport.mockResolvedValue(true);
    mocks.archiveReport.mockResolvedValue(true);

    expect(await caller.deleteDraft({ reportId: 'rep_1' })).toEqual({ ok: true });
    expect(await caller.archive({ reportId: 'rep_2' })).toEqual({ ok: true });
  });
});
