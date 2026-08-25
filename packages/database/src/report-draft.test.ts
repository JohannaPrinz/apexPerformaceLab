import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * The draft column, checked where the two files that must agree about it live.
 *
 * A Prisma field and the migration that creates it are written in different
 * places and neither breaks if only one is edited: the client generates from
 * the schema, and the database follows the migrations. A column declared but
 * never created fails at the first query against a real database — which is
 * exactly the failure this catches without needing one.
 *
 * Textual on purpose, for the same reason as `exports.test.ts`: reading both
 * files keeps the test free of a connection.
 */

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');

const schema = read('../prisma/schema.prisma');

const migrations = (): string => {
  const dir = new URL('../prisma/migrations/', import.meta.url);

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFileSync(new URL(`${entry.name}/migration.sql`, dir), 'utf8'))
    .join('\n');
};

describe('the analysis draft column', () => {
  it('is declared on the Report model', () => {
    const report = /model Report \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';

    expect(report).toMatch(/^\s*draft\s+Json\?/m);
  });

  it('is created by a migration', () => {
    expect(migrations()).toMatch(/ALTER TABLE "reports"\s*\n?\s*ADD COLUMN "draft" JSONB/);
  });

  it('is nullable, so every existing analysis keeps its meaning', () => {
    // A default or a NOT NULL would mean a backfill, and there is nothing to
    // back-fill: an analysis written before drafts existed has no text.
    const statement = /ADD COLUMN "draft" JSONB[^;]*/.exec(migrations())?.[0] ?? '';

    expect(statement).not.toMatch(/NOT NULL/);
    expect(statement).not.toMatch(/DEFAULT/);
  });

  it('leaves the published snapshot alone', () => {
    // `content` is the frozen document (§16). The draft exists so that column
    // never has to be edited.
    const report = /model Report \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';

    expect(report).toMatch(/^\s*content\s+Json\?/m);
    expect(migrations()).not.toMatch(/ALTER TABLE "reports"[\s\S]{0,80}DROP COLUMN "content"/);
  });

  it('keeps the constraint that a published analysis carries its snapshot', () => {
    // Adding a draft must not weaken what publication means.
    expect(migrations()).toMatch(/reports_published_has_content/);
  });
});
