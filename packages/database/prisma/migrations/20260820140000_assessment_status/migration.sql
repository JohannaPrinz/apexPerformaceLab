-- An assessment gets a lifecycle of its own.
--
-- Until now only its tests had a status, so an examination could be neither
-- started, finished, abandoned nor put away — the coach could see that three
-- tests were done but not that the session they belonged to was over.
--
-- The states mirror `AssessmentModuleStatus` one level up. SKIPPED is absent:
-- an examination that does not happen is not created, or is archived without
-- ever running. ARCHIVED is terminal, matching PerformanceCase (§8).
CREATE TYPE "AssessmentStatus" AS ENUM (
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'ABORTED',
  'ARCHIVED'
);

ALTER TABLE "assessments"
  ADD COLUMN "status" "AssessmentStatus" NOT NULL DEFAULT 'PLANNED';

-- Existing rows are read from their tests rather than left at the default.
--
-- A uniform PLANNED would say that every examination ever recorded is still
-- ahead of the coach, which is false for any that ran. The rule below is the
-- same one `assessmentStatusFrom` applies in code, so the backfill and the
-- application can never disagree about what a set of tests means:
--
--   no modules, or every module PLANNED  → PLANNED   (the default, left alone)
--   every module decided                 → COMPLETED
--   anything else                        → IN_PROGRESS
--
-- "Decided" is COMPLETED, SKIPPED or ABORTED — a test the coach has finished
-- thinking about. PLANNED and IN_PROGRESS are the two that are still open.
UPDATE "assessments" a
SET "status" = 'COMPLETED'
WHERE EXISTS (SELECT 1 FROM "assessment_modules" m WHERE m."assessmentId" = a.id)
  AND NOT EXISTS (
    SELECT 1 FROM "assessment_modules" m
    WHERE m."assessmentId" = a.id
      AND m."status" IN ('PLANNED', 'IN_PROGRESS')
  );

UPDATE "assessments" a
SET "status" = 'IN_PROGRESS'
WHERE a."status" = 'PLANNED'
  AND EXISTS (
    SELECT 1 FROM "assessment_modules" m
    WHERE m."assessmentId" = a.id
      AND m."status" <> 'PLANNED'
  );

CREATE INDEX "assessments_status_idx" ON "assessments" ("status");
