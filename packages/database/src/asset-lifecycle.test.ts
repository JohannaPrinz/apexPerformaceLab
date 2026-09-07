import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * The referential rules the file lifecycle rests on (§18).
 *
 * `services/assets/deletion.ts` decides *whether* a file may go; what happens
 * to everything attached to it is decided here, by the schema. The two halves
 * must agree, and the half in the schema is invisible from the service — a
 * changed `onDelete` would break the rule with no type error and no failing
 * unit test anywhere near it.
 *
 * Textual, for the same reason `exports.test.ts` is: these constraints do not
 * exist at runtime, and importing the client would want a live database.
 * Substrings rather than patterns, so the test says what it expects to read.
 */

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

/**
 * The body of one model block.
 *
 * Split rather than matched: a rule found in a neighbouring model would be a
 * test that passes for the wrong reason, and splitting makes that impossible
 * without an escape sequence anybody has to reason about.
 */
function modelBody(name: string): string {
  const blocks = schema.split('\nmodel ');
  const block = blocks.find((part) => part.startsWith(`${name} {`));

  expect(block, `model ${name} not found`).toBeDefined();

  return (block ?? '').split('\n}')[0] ?? '';
}

describe('what follows a file when it is deleted', () => {
  it('takes its annotations with it', () => {
    // A remark at 00:14 of a recording nobody can watch has no standing on its
    // own, so nothing holds a video back on their account (§18).
    expect(modelBody('VideoAnnotation')).toContain(
      'asset          Asset        @relation(fields: [assetId], references: [id], onDelete: Cascade)',
    );
  });

  it('takes its evidence links with it — after the service has checked them', () => {
    // The cascade is the mechanism; the policy is `insightsLosingEvidence`,
    // which runs first. A foreign key cannot tell whether a finding still
    // stands on its own.
    expect(modelBody('InsightAsset')).toContain(
      'asset     Asset   @relation(fields: [assetId], references: [id], onDelete: Cascade)',
    );
  });
});

describe('what survives its shelf', () => {
  it('keeps the files when a folder is removed', () => {
    // Emptying a shelf is not the same decision as destroying its contents:
    // `SetNull`, so the files become loose rather than disappearing (§18).
    expect(modelBody('Asset')).toContain(
      'folder   AssetFolder? @relation(fields: [folderId], references: [id], onDelete: SetNull)',
    );
  });

  it('keeps one folder name per athlete', () => {
    expect(modelBody('AssetFolder')).toContain('@@unique([athleteId, name])');
  });

  it('records who filed a folder, and allows nobody', () => {
    // Nullable, because both sides file (§21) and null means the athlete —
    // the same convention as `Asset.uploadedByCoachId`.
    expect(modelBody('AssetFolder')).toContain('createdByCoachId String?');
  });
});
