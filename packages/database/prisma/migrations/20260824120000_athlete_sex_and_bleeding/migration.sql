-- Two additions, both needed before a caliper measurement can mean anything.
--
-- 1. The athlete's sex, because every skinfold body-density equation is fitted
--    separately for male and female bodies. Without it the calculation cannot
--    be performed at all, and picking one of the two equations would put a
--    number in a health record that no method produced.
--
-- 2. Menstrual bleeding as its own object, standing alone in time. Not a
--    Measurement: it is not produced by a test, does not belong to an
--    Assessment, and the person best placed to record it is the athlete.

-- ── The athlete's sex ───────────────────────────────────────────────────────
--
-- A default rather than a backfill: every athlete recorded before this column
-- existed was never asked, which is exactly what `not_specified` says. Nothing
-- has to be migrated and no existing row changes meaning.
CREATE TYPE "athlete_sex" AS ENUM ('male', 'female', 'not_specified');

ALTER TABLE "athletes"
  ADD COLUMN "sex" "athlete_sex" NOT NULL DEFAULT 'not_specified';

-- ── Documented bleeding ────────────────────────────────────────────────────
--
-- Who recorded it, as a person rather than as an instrument: `MeasurementSource`
-- answers "typed, device or import", and both an athlete and a coach type.
CREATE TYPE "recorded_by" AS ENUM ('ATHLETE', 'COACH');

CREATE TABLE "bleeding_episodes" (
  "id" TEXT NOT NULL,
  -- A date, not a timestamp: nobody records a menstruation to the minute, and a
  -- time would invite a precision the time zone would then quietly change.
  "startedOn" DATE NOT NULL,
  "endedOn" DATE,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "organizationId" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "recordedBy" "recorded_by" NOT NULL,
  -- Set when a coach recorded it, null when the athlete did.
  "recordedByCoachId" TEXT,

  CONSTRAINT "bleeding_episodes_pkey" PRIMARY KEY ("id")
);

-- Recording the same first day twice is a duplicate, not a second bleeding —
-- and both the athlete and their coach may enter it.
CREATE UNIQUE INDEX "bleeding_episodes_athleteId_startedOn_key"
  ON "bleeding_episodes" ("athleteId", "startedOn");

CREATE INDEX "bleeding_episodes_organizationId_idx"
  ON "bleeding_episodes" ("organizationId");

-- The read this table exists for: one athlete's documented bleedings in order.
CREATE INDEX "bleeding_episodes_athleteId_startedOn_idx"
  ON "bleeding_episodes" ("athleteId", "startedOn");

ALTER TABLE "bleeding_episodes"
  ADD CONSTRAINT "bleeding_episodes_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bleeding_episodes"
  ADD CONSTRAINT "bleeding_episodes_athleteId_fkey"
  FOREIGN KEY ("athleteId") REFERENCES "athletes" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- `Restrict`, like every other authorship link: a coach row is a tombstone that
-- survives deletion, so authorship never silently detaches.
ALTER TABLE "bleeding_episodes"
  ADD CONSTRAINT "bleeding_episodes_recordedByCoachId_fkey"
  FOREIGN KEY ("recordedByCoachId") REFERENCES "coaches" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A coach-recorded episode names the coach; an athlete-recorded one does not.
-- The pair is the fact, so it is checked here rather than in every writer.
ALTER TABLE "bleeding_episodes"
  ADD CONSTRAINT "bleeding_episodes_author_matches_role"
  CHECK (
    ("recordedBy" = 'COACH' AND "recordedByCoachId" IS NOT NULL)
    OR ("recordedBy" = 'ATHLETE' AND "recordedByCoachId" IS NULL)
  );

-- A bleeding cannot end before it began.
ALTER TABLE "bleeding_episodes"
  ADD CONSTRAINT "bleeding_episodes_ends_after_start"
  CHECK ("endedOn" IS NULL OR "endedOn" >= "startedOn");
