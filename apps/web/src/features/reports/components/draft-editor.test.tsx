import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DraftEditor, type DraftView } from './draft-editor';

/**
 * The editable text of an analysis.
 *
 * Every test here serves one rule: **nothing overwrites what the coach wrote
 * except the coach asking for it.** A late value, a test added or set aside, a
 * re-render — none of them may touch a typed sentence; what changes is what the
 * screen says about the basis.
 *
 * The workspace boundary and the write itself are asserted in
 * `server/service.test.ts` against the real queries. Mocking the action here
 * proves nothing about either.
 */

const mocks = vi.hoisted(() => ({
  saved: [] as { target: unknown; text: string }[],
  regenerated: [] as unknown[],
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('../server/actions', () => ({
  updateDraftTextAction: (_reportId: string, target: unknown, text: string) => {
    mocks.saved.push({ target, text });

    return Promise.resolve({ status: 'idle' });
  },
  regenerateDraftAction: (_reportId: string, target: unknown) => {
    mocks.regenerated.push(target);

    return Promise.resolve({ status: 'idle' });
  },
}));

const section = (over: Partial<DraftView['sections'][number]> = {}) => ({
  moduleId: 'mod_1',
  name: 'Laufband Mai',
  typeLabel: 'Laktat',
  text: '16 von 16 Werten erfasst, 4 Stufen.',
  generated: true,
  basisChanged: false,
  ...over,
});

const draft = (over: Partial<DraftView> = {}): DraftView => ({
  reportId: 'rep_1',
  title: 'Auswertung',
  version: 1,
  overall: { text: 'Ein Test einbezogen: Laktat.', generated: true },
  sections: [section()],
  addedModuleNames: [],
  removedModuleIds: [],
  ...over,
});

const renderEditor = (data: DraftView = draft(), readOnly = false) =>
  render(<DraftEditor draft={data} readOnly={readOnly} />);

const field = (name: string) => screen.getByLabelText(name);

beforeEach(() => {
  mocks.saved.length = 0;
  mocks.regenerated.length = 0;
});

describe('what the editor shows', () => {
  it('offers an assessment-wide text and one per test', () => {
    renderEditor();

    expect(field('Gesamtauswertung')).toBeVisible();
    expect(field('Laufband Mai')).toBeVisible();
  });

  it('puts the generated wording in the box', () => {
    renderEditor();

    expect(field('Laufband Mai')).toHaveValue('16 von 16 Werten erfasst, 4 Stufen.');
  });

  it('marks text it produced itself', () => {
    renderEditor();

    expect(screen.getAllByText('Automatisch erzeugt')).toHaveLength(2);
  });

  it('says outright that it does not assess', () => {
    // The absence of a verdict is easy to mistake for an oversight.
    renderEditor();

    expect(screen.getByText(/keine fachliche Bewertung/)).toBeVisible();
  });

  it('names the kind of test beside its section', () => {
    renderEditor();

    expect(screen.getByText('Laktat')).toBeVisible();
  });
});

describe('the generated marking', () => {
  it('is gone once the text is the coach’s own', () => {
    // A sentence a person wrote must never carry a label saying a machine
    // produced it.
    renderEditor(draft({ sections: [section({ generated: false, text: 'Mein Text.' })] }));

    const block = field('Laufband Mai').closest('div') as HTMLElement;

    expect(within(block).getByText('Bearbeitet')).toBeVisible();
    expect(within(block).queryByText('Automatisch erzeugt')).toBeNull();
  });

  it('stays on the sections the coach has not touched', () => {
    renderEditor(
      draft({
        sections: [
          section({ generated: false }),
          section({ moduleId: 'mod_2', name: 'Kraft QA', generated: true }),
        ],
      }),
    );

    expect(screen.getAllByText('Automatisch erzeugt')).toHaveLength(2);
    expect(screen.getAllByText('Bearbeitet')).toHaveLength(1);
  });
});

describe('editing', () => {
  it('saves what was typed when the field is left', async () => {
    // A paragraph is written, not typed at.
    const user = userEvent.setup();
    renderEditor();

    await user.clear(field('Laufband Mai'));
    await user.type(field('Laufband Mai'), 'Eigener Text.');
    await user.tab();

    expect(mocks.saved).toEqual([
      { target: { kind: 'section', moduleId: 'mod_1' }, text: 'Eigener Text.' },
    ]);
  });

  it('saves nothing while the text is unchanged', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(field('Laufband Mai'));
    await user.tab();

    expect(mocks.saved).toEqual([]);
  });

  it('addresses the assessment-wide text as its own target', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.clear(field('Gesamtauswertung'));
    await user.type(field('Gesamtauswertung'), 'Meine Einschätzung.');
    await user.tab();

    expect(mocks.saved[0]?.target).toEqual({ kind: 'overall' });
  });

  it('never writes while the examination is closed', async () => {
    const user = userEvent.setup();
    renderEditor(draft(), true);

    expect(field('Laufband Mai')).toHaveAttribute('readonly');

    await user.click(field('Laufband Mai'));
    await user.tab();

    expect(mocks.saved).toEqual([]);
  });
});

describe('when the values move under a text', () => {
  const moved = () =>
    draft({ sections: [section({ basisChanged: true, generated: false, text: 'Mein Text.' })] });

  it('says so rather than rewriting anything', () => {
    renderEditor(moved());

    expect(screen.getByText(/Werte haben sich seit der Erzeugung geändert/)).toBeVisible();
  });

  it('leaves the coach’s text exactly where it was', () => {
    renderEditor(moved());

    expect(field('Laufband Mai')).toHaveValue('Mein Text.');
  });

  it('regenerates nothing until the coach asks', () => {
    renderEditor(moved());

    expect(mocks.regenerated).toEqual([]);
  });

  it('says nothing where the basis still matches', () => {
    renderEditor();

    expect(screen.queryByText(/haben sich seit der Erzeugung geändert/)).toBeNull();
  });

  it('names a test taken into the analysis after the text was written', () => {
    renderEditor(draft({ addedModuleNames: ['Kraft QA'] }));

    expect(screen.getByText(/„Kraft QA" wurde in die Auswertung aufgenommen/)).toBeVisible();
  });

  it('counts several such tests rather than listing them all', () => {
    renderEditor(draft({ addedModuleNames: ['A', 'B'] }));

    expect(screen.getByText(/2 Tests wurden in die Auswertung aufgenommen/)).toBeVisible();
  });
});

describe('regenerating one text', () => {
  it('asks for exactly the section whose button was pressed', async () => {
    const user = userEvent.setup();
    renderEditor(
      draft({
        sections: [section(), section({ moduleId: 'mod_2', name: 'Kraft QA' })],
      }),
    );

    const block = field('Kraft QA').closest('div') as HTMLElement;
    await user.click(within(block).getByRole('button', { name: 'Neu erzeugen' }));

    expect(mocks.regenerated).toEqual([{ kind: 'section', moduleId: 'mod_2' }]);
  });

  it('asks for the assessment-wide text on its own', async () => {
    const user = userEvent.setup();
    renderEditor();

    const block = field('Gesamtauswertung').closest('div') as HTMLElement;
    await user.click(within(block).getByRole('button', { name: 'Neu erzeugen' }));

    expect(mocks.regenerated).toEqual([{ kind: 'overall' }]);
  });

  it('offers nothing to regenerate while the examination is closed', () => {
    renderEditor(draft(), true);

    expect(screen.queryByRole('button', { name: 'Neu erzeugen' })).toBeNull();
  });
});

describe('what the editor never says', () => {
  it('calls no value good or bad', () => {
    renderEditor(draft({ sections: [section({ basisChanged: true })], addedModuleNames: ['A'] }));

    const text = (document.body.textContent ?? '').toLowerCase();

    for (const word of [
      'verbessert',
      'verschlechtert',
      'auffällig',
      'optimal',
      'zu hoch',
      'norm',
      'empfehl',
    ]) {
      expect(text, word).not.toContain(word);
    }
  });
});
