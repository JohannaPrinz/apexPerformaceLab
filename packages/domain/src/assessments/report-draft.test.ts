import { describe, expect, it } from 'vitest';

import {
  draftSectionOf,
  emptyReportDraft,
  hasWrittenText,
  readReportDraft,
  REPORT_DRAFT_VERSION,
  withDraftText,
} from './report-draft';

/**
 * The coach's own words.
 *
 * Two things have to hold above the rest: what a coach already wrote must
 * survive a change of shape, and nothing in here may ever be authored by the
 * system. The second is easy to break by accident — a default value, a seeded
 * section — and impossible to notice afterwards, because a stored sentence looks
 * the same whoever wrote it.
 */

describe('a new draft', () => {
  it('is empty, because nothing here is written by us', () => {
    const draft = emptyReportDraft();

    expect(draft.version).toBe(REPORT_DRAFT_VERSION);
    expect(draft.overall).toEqual({ interpretation: '', recommendation: '' });
    expect(draft.sections).toEqual([]);
  });

  it('reports that nothing has been written', () => {
    expect(hasWrittenText(emptyReportDraft())).toBe(false);
  });
});

describe('writing', () => {
  it('stores an interpretation for the analysis as a whole', () => {
    const draft = withDraftText(
      emptyReportDraft(),
      { kind: 'overall' },
      'interpretation',
      'Die Seitendifferenz besteht fort.',
    );

    expect(draft.overall.interpretation).toBe('Die Seitendifferenz besteht fort.');
    expect(draft.overall.recommendation).toBe('');
  });

  it('keeps the two texts of one test apart', () => {
    let draft = withDraftText(
      emptyReportDraft(),
      { kind: 'section', moduleId: 'mod_1' },
      'interpretation',
      'Tiefe links eingeschränkt.',
    );
    draft = withDraftText(
      draft,
      { kind: 'section', moduleId: 'mod_1' },
      'recommendation',
      'Sprunggelenksmobilisation, 3× wöchentlich.',
    );

    const section = draftSectionOf(draft, 'mod_1');

    expect(section.interpretation).toBe('Tiefe links eingeschränkt.');
    expect(section.recommendation).toBe('Sprunggelenksmobilisation, 3× wöchentlich.');
    expect(draft.sections).toHaveLength(1);
  });

  it('creates a section on first writing, never up front', () => {
    // A draft holds the texts that exist. A test the coach never wrote about
    // leaves no trace, so an empty section can never be mistaken for a
    // considered blank.
    const draft = withDraftText(
      emptyReportDraft(),
      { kind: 'section', moduleId: 'mod_9' },
      'recommendation',
      'Wiederholung in vier Wochen.',
    );

    expect(draft.sections.map((section) => section.moduleId)).toEqual(['mod_9']);
  });

  it('leaves every other text untouched', () => {
    let draft = withDraftText(emptyReportDraft(), { kind: 'overall' }, 'interpretation', 'A');
    draft = withDraftText(draft, { kind: 'section', moduleId: 'mod_1' }, 'interpretation', 'B');
    draft = withDraftText(draft, { kind: 'section', moduleId: 'mod_2' }, 'interpretation', 'C');
    draft = withDraftText(draft, { kind: 'section', moduleId: 'mod_1' }, 'interpretation', 'B2');

    expect(draft.overall.interpretation).toBe('A');
    expect(draftSectionOf(draft, 'mod_1').interpretation).toBe('B2');
    expect(draftSectionOf(draft, 'mod_2').interpretation).toBe('C');
  });

  it('answers with empty texts for a test nobody wrote about', () => {
    expect(draftSectionOf(emptyReportDraft(), 'mod_unknown')).toEqual({
      moduleId: 'mod_unknown',
      interpretation: '',
      recommendation: '',
    });
  });

  it('notices as soon as anything at all stands', () => {
    const draft = withDraftText(
      emptyReportDraft(),
      { kind: 'section', moduleId: 'mod_1' },
      'recommendation',
      'x',
    );

    expect(hasWrittenText(draft)).toBe(true);
    // Whitespace is not writing.
    expect(
      hasWrittenText(
        withDraftText(emptyReportDraft(), { kind: 'overall' }, 'interpretation', '   '),
      ),
    ).toBe(false);
  });
});

describe('reading what is already stored', () => {
  it('reads the current shape', () => {
    const stored = {
      version: 2,
      overall: { interpretation: 'A', recommendation: 'B' },
      sections: [{ moduleId: 'mod_1', interpretation: 'C', recommendation: 'D' }],
    };

    expect(readReportDraft(stored)?.overall.recommendation).toBe('B');
  });

  it('upgrades a version 1 draft without losing a word', () => {
    // The paragraph a coach edited was their reading of the test — which is
    // exactly what the interpretation field now means.
    const legacy = {
      version: 1,
      overall: { text: 'Gesamtbild unverändert.', generated: false, basis: 'erzeugt' },
      sections: [
        { moduleId: 'mod_1', text: 'Knie links flacher.', generated: false, basis: 'erzeugt' },
      ],
    };

    const upgraded = readReportDraft(legacy);

    expect(upgraded?.version).toBe(REPORT_DRAFT_VERSION);
    expect(upgraded?.overall.interpretation).toBe('Gesamtbild unverändert.');
    expect(upgraded?.sections[0]?.interpretation).toBe('Knie links flacher.');
  });

  it('leaves the upgraded recommendation empty rather than inventing one', () => {
    const legacy = {
      version: 1,
      overall: { text: 'A', generated: true, basis: 'A' },
      sections: [{ moduleId: 'mod_1', text: 'B', generated: true, basis: 'B' }],
    };

    expect(readReportDraft(legacy)?.overall.recommendation).toBe('');
    expect(readReportDraft(legacy)?.sections[0]?.recommendation).toBe('');
  });

  it('refuses a shape it does not know rather than half-reading it', () => {
    expect(readReportDraft({ version: 99, overall: {}, sections: [] })).toBeNull();
    expect(readReportDraft(null)).toBeNull();
    expect(readReportDraft('a draft')).toBeNull();
  });
});
