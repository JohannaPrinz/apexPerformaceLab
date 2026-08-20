-- A test gets a name of its own, and an assessment may hold several of one type.
--
-- The type said what kind of test it was and, through the unique index, also
-- which one — so a session with a lactate run, a sprint and an endurance run
-- could not be recorded. The name carries identity now; the type stays the
-- comparison key between assessments (§11).
--
-- Nullable, so existing rows need no backfill: every screen falls back to the
-- type's label when the name is absent.
ALTER TABLE "assessment_modules"
  ADD COLUMN "name" TEXT;

DROP INDEX IF EXISTS "assessment_modules_assessmentId_moduleKey_key";

CREATE INDEX "assessment_modules_assessmentId_moduleKey_idx"
  ON "assessment_modules" ("assessmentId", "moduleKey");
