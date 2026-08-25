-- The working text of an analysis, beside the snapshot rather than inside it.
--
-- `content` is what a published Report froze (§16): written once, immutable
-- after, and the document an athlete may already hold. The draft is the
-- opposite — the coach edits it for as long as the analysis is open. Putting
-- both in one column would mean either a snapshot that changes or a draft that
-- cannot.
--
-- Additive and nullable: every existing Report keeps the meaning it had, since
-- a null draft is "no text produced yet", which is what all of them are. No
-- backfill, no default, and nothing to migrate.
--
-- The payload's shape is validated in `packages/domain` and carries its own
-- version number, so a column of loose JSON never has to be guessed at.
ALTER TABLE "reports"
  ADD COLUMN "draft" JSONB;
