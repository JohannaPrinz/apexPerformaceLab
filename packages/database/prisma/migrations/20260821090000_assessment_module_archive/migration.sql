-- A test can be put away without being deleted.
--
-- One nullable column, no backfill, no default: every existing test keeps the
-- meaning it had, because a null `archivedAt` is "not archived", which is what
-- all of them are.
--
-- A **date, not a status**. `PerformanceCase` and `Assessment` carry an
-- `ARCHIVED` status, but a test's status says how far the coach got — an
-- `ARCHIVED` status would overwrite `COMPLETED`, and a test shown again after
-- archiving could then no longer say whether it was performed or skipped. That
-- is precisely the fact an evaluation reads. `Athlete`, `Exercise` and `Coach`
-- already use a date for the same reason.
--
-- Nothing is ever deleted by archiving: the measurements are the record (§13).
ALTER TABLE "assessment_modules"
  ADD COLUMN "archivedAt" TIMESTAMP(3);

-- The assessment view lists the tests that are not archived, which is the read
-- this column exists to serve.
CREATE INDEX "assessment_modules_assessmentId_archivedAt_idx"
  ON "assessment_modules" ("assessmentId", "archivedAt");
