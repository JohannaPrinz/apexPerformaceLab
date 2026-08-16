-- Exercise relationships carry a type.
--
-- Additive: the column takes a default, so every existing row keeps working and
-- nothing has to be backfilled. `related` is the safe default — it claims the
-- two exercises are close, not that one can replace the other.
--
-- The value is checked against a controlled vocabulary in code
-- (`EXERCISE_RELATIONSHIP_TYPES`), the same arrangement `moduleKey` and the
-- exercise taxonomies already use: correcting the list is a reviewable diff
-- rather than a migration.
ALTER TABLE "exercise_variants"
  ADD COLUMN "type" TEXT NOT NULL DEFAULT 'related';
