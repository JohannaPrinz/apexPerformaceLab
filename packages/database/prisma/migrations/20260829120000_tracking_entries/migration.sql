-- A value that stands alone in time, and the cards that follow one.
--
-- ## Why a table and not a relaxed Measurement
--
-- §13 states it: a Measurement is a fact the Coach records inside an Assessment
-- and never edits, while an athlete's Tuesday body weight is neither. Three
-- consequences, each of which would be lost by merging them:
--
--   * A Measurement is corrected by superseding it. A mistyped body weight does
--     not deserve a supersede chain.
--   * `measurements.assessmentModuleId` is NOT NULL, and that is a guarantee —
--     every Measurement has a professional context. Relaxing it would take that
--     assurance away from the whole record.
--   * Every query about "this Assessment's measurements" would grow a filter
--     somebody has to remember. That is where silent errors live.
--
-- The type is **shared**: `measurement_types` is referenced from here too, so a
-- coach-measured weight and a self-reported one are the same quantity in the
-- same unit and can be drawn on one axis with no translation layer. That is the
-- point of the design, not a convenience.
--
-- ## Entirely additive
--
-- One new table and one nullable column. Nothing existing changes meaning, there
-- is no backfill, and no default: a null `trendCards` means "no cards chosen
-- yet", which is what every current athlete is. A default would be the platform
-- deciding what matters about somebody.
--
-- ## Reversal
--
--   DROP TABLE "tracking_entries";
--   ALTER TABLE "athletes" DROP COLUMN "trendCards";
--
-- Safe while no entry has been written. Once entries exist, dropping the table
-- destroys athlete-reported data that lives nowhere else — export first.

-- Which quantities are followed as a curve on an athlete's profile: a list of
-- measurement-type catalogue keys, chosen by the Coach. Keys rather than ids,
-- because a key means the same in every workspace and is readable in a payload.
ALTER TABLE "athletes" ADD COLUMN "trendCards" JSONB;

CREATE TABLE "tracking_entries" (
    "id" TEXT NOT NULL,
    -- Same precision as `measurements.numericValue`, so one axis never rounds
    -- its two sources differently.
    "numericValue" DECIMAL(12,4) NOT NULL,
    -- A moment, not a date: a weight before breakfast and one after training
    -- are different readings of the same day.
    "capturedAt" TIMESTAMP(3) NOT NULL,
    -- The instrument. The same enum Measurements use.
    "source" "MeasurementSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "measurementTypeId" TEXT NOT NULL,
    -- The person. Independent of `source`: an Athlete and a Coach both type.
    "recordedBy" "recorded_by" NOT NULL,
    "recordedByCoachId" TEXT,
    -- So a device re-import is idempotent (§13).
    "externalSystem" TEXT,
    "externalId" TEXT,

    CONSTRAINT "tracking_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tracking_entries_organizationId_idx" ON "tracking_entries"("organizationId");

-- The read this table exists for: one athlete's series of one quantity, in
-- order. Covers the tenant scope through the athlete.
CREATE INDEX "tracking_entries_athleteId_measurementTypeId_capturedAt_idx" ON "tracking_entries"("athleteId", "measurementTypeId", "capturedAt");

CREATE INDEX "tracking_entries_measurementTypeId_idx" ON "tracking_entries"("measurementTypeId");

-- Serves the RESTRICT check on the foreign key below.
CREATE INDEX "tracking_entries_recordedByCoachId_idx" ON "tracking_entries"("recordedByCoachId");

ALTER TABLE "tracking_entries" ADD CONSTRAINT "tracking_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tracking_entries" ADD CONSTRAINT "tracking_entries_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT: a measurement type that a series depends on must not disappear
-- under it. Archiving takes a type out of the picker; deleting is refused.
ALTER TABLE "tracking_entries" ADD CONSTRAINT "tracking_entries_measurementTypeId_fkey" FOREIGN KEY ("measurementTypeId") REFERENCES "measurement_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RESTRICT, as everywhere: a Coach row is a tombstone that survives deletion,
-- so authorship never silently detaches.
ALTER TABLE "tracking_entries" ADD CONSTRAINT "tracking_entries_recordedByCoachId_fkey" FOREIGN KEY ("recordedByCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
