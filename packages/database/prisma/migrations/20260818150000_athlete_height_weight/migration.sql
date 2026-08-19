-- Body height (cm) and current body weight (kg) as Athlete profile fields.
--
-- Not redundant with the measurement history that arrives later:
-- `measurements.assessmentModuleId` is NOT NULL, so a measurement only exists
-- inside an assessment module. A weight noted at a first consultation, before
-- any assessment exists, has nowhere else to go.
--
-- Both nullable, no backfill, no default: an athlete entered during a first
-- consultation is often known by name alone.
ALTER TABLE "athletes"
  ADD COLUMN "heightCm" DECIMAL(5, 2),
  ADD COLUMN "weightKg" DECIMAL(5, 2);
