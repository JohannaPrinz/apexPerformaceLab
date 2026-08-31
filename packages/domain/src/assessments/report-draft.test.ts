import { describe, expect, it } from 'vitest';

import {
  draftSectionOf,
  emptyReportDraft,
  hasWrittenText,
  readReportDraft,
  REPORT_DRAFT_VERSION,
  chosenStills,
  withDraftStill,
  withDraftText,
} from './report-draft';
import { MAX_STILLS_PER_MODULE } from './report-media';

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
      stills: [],
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
      version: 3,
      overall: { interpretation: 'A', recommendation: 'B' },
      sections: [{ moduleId: 'mod_1', interpretation: 'C', recommendation: 'D', stills: ['k1'] }],
    };

    expect(readReportDraft(stored)?.sections[0]?.stills).toEqual(['k1']);
  });

  it('upgrades a version 2 draft by adding no pictures, which is the truth', () => {
    const stored = {
      version: 2,
      overall: { interpretation: 'A', recommendation: 'B' },
      sections: [{ moduleId: 'mod_1', interpretation: 'C', recommendation: 'D' }],
    };

    expect(readReportDraft(stored)?.overall.recommendation).toBe('B');
    expect(readReportDraft(stored)?.sections[0]?.stills).toEqual([]);
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

/**
 * Which stills a document uses.
 *
 * The rule under test is that choosing a picture is an editorial decision about
 * *this* analysis: a still nobody picked leaves no trace, so publication has
 * nothing to copy and cleanup has nothing to spare.
 */
describe('choosing stills', () => {
  const withStill = (moduleId: string, key: string) =>
    withDraftStill(emptyReportDraft(), moduleId, key, true);

  it('records a picked still against its test', () => {
    expect(withStill('mod_1', 'analysis/o/m/flexed__a.jpg').sections[0]).toMatchObject({
      moduleId: 'mod_1',
      stills: ['analysis/o/m/flexed__a.jpg'],
    });
  });

  it('creates no section for a still that was only ever unpicked', () => {
    // Otherwise an empty section would look like a considered blank.
    expect(withDraftStill(emptyReportDraft(), 'mod_1', 'k1', false).sections).toEqual([]);
  });

  it('appends, so an arranged order is not rearranged', () => {
    const draft = withDraftStill(withStill('mod_1', 'k1'), 'mod_1', 'k2', true);

    expect(draft.sections[0]?.stills).toEqual(['k1', 'k2']);
  });

  it('picks the same still only once', () => {
    const draft = withDraftStill(withStill('mod_1', 'k1'), 'mod_1', 'k1', true);

    expect(draft.sections[0]?.stills).toEqual(['k1']);
  });

  it('removes one and keeps the rest', () => {
    const two = withDraftStill(withStill('mod_1', 'k1'), 'mod_1', 'k2', true);

    expect(withDraftStill(two, 'mod_1', 'k1', false).sections[0]?.stills).toEqual(['k2']);
  });

  it('stops at the limit rather than growing without bound', () => {
    let draft = emptyReportDraft();
    for (let index = 0; index < MAX_STILLS_PER_MODULE + 4; index += 1) {
      draft = withDraftStill(draft, 'mod_1', `k${String(index)}`, true);
    }

    expect(draft.sections[0]?.stills).toHaveLength(MAX_STILLS_PER_MODULE);
  });

  it('leaves the texts of a test alone', () => {
    const written = withDraftText(
      emptyReportDraft(),
      { kind: 'section', moduleId: 'mod_1' },
      'interpretation',
      'Knie links flacher.',
    );

    const draft = withDraftStill(written, 'mod_1', 'k1', true);

    expect(draft.sections[0]?.interpretation).toBe('Knie links flacher.');
    expect(draft.sections[0]?.stills).toEqual(['k1']);
  });

  it('lists every picked still with the test it belongs to', () => {
    const draft = withDraftStill(withStill('mod_1', 'k1'), 'mod_2', 'k2', true);

    expect(chosenStills(draft)).toEqual([
      { moduleId: 'mod_1', key: 'k1' },
      { moduleId: 'mod_2', key: 'k2' },
    ]);
  });

  it('lists nothing where nobody picked anything', () => {
    expect(chosenStills(emptyReportDraft())).toEqual([]);
  });
});
