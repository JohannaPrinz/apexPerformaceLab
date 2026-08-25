import { describe, expect, it } from 'vitest';

import {
  draftBasisChange,
  draftFromFacts,
  generatedTextOf,
  readReportDraft,
  summariseAssessmentOverall,
  withDraftText,
  withRegeneratedText,
  type ReportDraft,
} from './report-draft';

import type { SummaryModule } from './summary';

/**
 * The working text of an analysis.
 *
 * One rule dominates this file and every test below serves it: **nothing
 * overwrites what a coach wrote except a coach asking for it.** Values arriving
 * late, a test being added or removed, the page being reloaded — none of them
 * may touch a sentence a person typed. What changes instead is what the screen
 * *says* about the basis.
 */

const facts = [
  { moduleId: 'mod_1', text: '16 von 16 Werten erfasst, 4 Stufen.' },
  { moduleId: 'mod_2', text: '2 von 2 Werten erfasst, einfache Erfassung.' },
];

const fresh = (draft: ReportDraft = draftFromFacts('Zwei Tests einbezogen.', facts)) => draft;

describe('a draft made from the facts', () => {
  const draft = fresh();

  it('starts marked as generated throughout', () => {
    expect(draft.overall.generated).toBe(true);
    expect(draft.sections.every((section) => section.generated)).toBe(true);
  });

  it('holds one section per included test, in order', () => {
    expect(draft.sections.map((section) => section.moduleId)).toEqual(['mod_1', 'mod_2']);
  });

  it('remembers what each text was generated from', () => {
    expect(draft.sections[0]?.basis).toBe(draft.sections[0]?.text);
    expect(draft.overall.basis).toBe(draft.overall.text);
  });

  it('carries its shape version, so a later shape is not half-read', () => {
    expect(draft.version).toBe(1);
  });

  it('reads back through its own contract', () => {
    expect(readReportDraft(draft)).toEqual(draft);
  });

  it('refuses a payload it does not understand', () => {
    expect(readReportDraft({ version: 99, overall: {}, sections: [] })).toBeNull();
    expect(readReportDraft(null)).toBeNull();
    expect(readReportDraft({ sections: [] })).toBeNull();
  });
});

describe('the coach editing a text', () => {
  it('keeps what they wrote', () => {
    const edited = withDraftText(fresh(), { kind: 'section', moduleId: 'mod_1' }, 'Eigener Text.');

    expect(edited.sections[0]?.text).toBe('Eigener Text.');
  });

  it('drops the generated marking for that text', () => {
    // A sentence a person wrote must never carry a label saying a machine
    // produced it.
    const edited = withDraftText(fresh(), { kind: 'section', moduleId: 'mod_1' }, 'Eigener Text.');

    expect(edited.sections[0]?.generated).toBe(false);
  });

  it('leaves every other text exactly as it was', () => {
    const edited = withDraftText(fresh(), { kind: 'section', moduleId: 'mod_1' }, 'Eigener Text.');

    expect(edited.sections[1]).toEqual(fresh().sections[1]);
    expect(edited.overall).toEqual(fresh().overall);
  });

  it('keeps the basis, so a later change of the values is still noticed', () => {
    const edited = withDraftText(fresh(), { kind: 'section', moduleId: 'mod_1' }, 'Eigener Text.');

    expect(edited.sections[0]?.basis).toBe(facts[0]!.text);
  });

  it('is generated again if the coach types the generated wording back', () => {
    const edited = withDraftText(fresh(), { kind: 'section', moduleId: 'mod_1' }, facts[0]!.text);

    expect(edited.sections[0]?.generated).toBe(true);
  });

  it('edits the assessment-wide text the same way', () => {
    const edited = withDraftText(fresh(), { kind: 'overall' }, 'Gesamteinschätzung.');

    expect(edited.overall).toMatchObject({ text: 'Gesamteinschätzung.', generated: false });
    expect(edited.sections).toEqual(fresh().sections);
  });

  it('ignores a section the draft does not hold', () => {
    const edited = withDraftText(fresh(), { kind: 'section', moduleId: 'mod_x' }, 'Nichts.');

    expect(edited).toEqual(fresh());
  });
});

describe('regenerating one text on purpose', () => {
  const edited = withDraftText(fresh(), { kind: 'section', moduleId: 'mod_1' }, 'Eigener Text.');

  it('overwrites only where it was asked to', () => {
    // The one path that replaces coach text, and it exists because they asked.
    const again = withRegeneratedText(edited, { kind: 'section', moduleId: 'mod_1' }, 'Neu.');

    expect(again.sections[0]?.text).toBe('Neu.');
    expect(again.sections[1]).toEqual(edited.sections[1]);
    expect(again.overall).toEqual(edited.overall);
  });

  it('marks the replaced text as generated again', () => {
    const again = withRegeneratedText(edited, { kind: 'section', moduleId: 'mod_1' }, 'Neu.');

    expect(again.sections[0]).toMatchObject({ generated: true, basis: 'Neu.' });
  });

  it('never touches another section that the coach edited', () => {
    const both = withDraftText(edited, { kind: 'section', moduleId: 'mod_2' }, 'Auch eigener.');
    const again = withRegeneratedText(both, { kind: 'section', moduleId: 'mod_1' }, 'Neu.');

    expect(again.sections[1]).toMatchObject({ text: 'Auch eigener.', generated: false });
  });

  it('adds a section for a test included after the draft was made', () => {
    const added = withRegeneratedText(fresh(), { kind: 'section', moduleId: 'mod_3' }, 'Dritter.');

    expect(added.sections.map((section) => section.moduleId)).toEqual(['mod_1', 'mod_2', 'mod_3']);
  });

  it('regenerates the assessment-wide text on its own', () => {
    const again = withRegeneratedText(edited, { kind: 'overall' }, 'Neu gesamt.');

    expect(again.overall).toMatchObject({ text: 'Neu gesamt.', generated: true });
    expect(again.sections).toEqual(edited.sections);
  });
});

/**
 * What moved under a finished draft.
 */
describe('noticing that the basis has changed', () => {
  it('says nothing while the facts are unchanged', () => {
    expect(draftBasisChange(fresh(), facts)).toEqual({
      changedModuleIds: [],
      addedModuleIds: [],
      removedModuleIds: [],
    });
  });

  it('notices a value that arrived after the draft was written', () => {
    const later = [{ ...facts[0]!, text: '17 von 16 Werten erfasst, 4 Stufen.' }, facts[1]!];

    expect(draftBasisChange(fresh(), later).changedModuleIds).toEqual(['mod_1']);
  });

  it('notices it even where the coach has rewritten the text', () => {
    // The basis is what is compared, never the coach's wording — otherwise
    // editing a section would hide every later change to its numbers.
    const edited = withDraftText(fresh(), { kind: 'section', moduleId: 'mod_1' }, 'Eigener Text.');
    const later = [{ ...facts[0]!, text: 'Anders.' }, facts[1]!];

    expect(draftBasisChange(edited, later).changedModuleIds).toEqual(['mod_1']);
  });

  it('notices a test taken into the analysis', () => {
    const later = [...facts, { moduleId: 'mod_3', text: 'Neu.' }];

    expect(draftBasisChange(fresh(), later).addedModuleIds).toEqual(['mod_3']);
  });

  it('notices a test set aside', () => {
    expect(draftBasisChange(fresh(), [facts[0]!]).removedModuleIds).toEqual(['mod_2']);
  });

  it('changes nothing about the draft by looking', () => {
    const draft = fresh();
    const before = structuredClone(draft);

    draftBasisChange(draft, [{ moduleId: 'mod_1', text: 'Anders.' }]);

    expect(draft).toEqual(before);
  });
});

describe('the assessment-wide opening', () => {
  const summaryModule = (over: Partial<SummaryModule> = {}): SummaryModule => ({
    name: 'Laufband',
    typeLabel: 'Laktat',
    passes: 4,
    recorded: 16,
    expected: 16,
    quantities: [],
    ...over,
  });

  it('counts the tests and names their kinds', () => {
    const text = summariseAssessmentOverall([
      summaryModule(),
      summaryModule({ typeLabel: 'Körperzusammensetzung', recorded: 2, expected: 2 }),
    ]);

    expect(text).toBe(
      '2 Tests einbezogen: Laktat, Körperzusammensetzung. Insgesamt 18 von 18 Werten erfasst.',
    );
  });

  it('names a kind once even where two tests share it', () => {
    const text = summariseAssessmentOverall([summaryModule(), summaryModule()]);

    expect(text).toContain('Laktat.');
    expect(text).not.toContain('Laktat, Laktat');
  });

  it('speaks of one test in the singular', () => {
    expect(summariseAssessmentOverall([summaryModule()])).toContain('Ein Test einbezogen');
  });

  it('says plainly when nothing is drawn on', () => {
    expect(summariseAssessmentOverall([])).toBe('Diese Auswertung zieht noch keinen Test heran.');
  });

  it('never assesses anything', () => {
    const text = summariseAssessmentOverall([
      summaryModule(),
      summaryModule({ typeLabel: 'Kraft', recorded: 3, expected: 12 }),
    ]).toLowerCase();

    for (const word of [
      'gut',
      'schlecht',
      'auffällig',
      'unvollständig',
      'empfehl',
      'norm',
      'verbessert',
    ]) {
      expect(text, word).not.toContain(word);
    }
  });
});

describe('turning a summary section into text', () => {
  it('joins the sentences into one paragraph', () => {
    expect(generatedTextOf({ name: 'A', typeLabel: 'Laktat', sentences: ['Eins.', 'Zwei.'] })).toBe(
      'Eins. Zwei.',
    );
  });
});
