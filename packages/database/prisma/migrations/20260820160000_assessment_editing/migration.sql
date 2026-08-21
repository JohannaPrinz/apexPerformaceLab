-- Editing what a coach wrote, and recording what changed after the fact.
--
-- Five columns, all nullable, no backfill and no default. Every existing row
-- keeps exactly the meaning it had: a null description is "none was written",
-- a null completedAt is "this test was never called finished", and a null
-- passIndex on a note is "about the test as a whole" — which is what every
-- note written before this migration was.
--
-- Nothing is derived, dropped or rewritten here.

-- An examination gains an optional description beside its question.
--
-- The question stays mandatory (§10) and stays the name: data is never
-- collected without a purpose, and a separate name would either repeat the
-- question or contradict it. This carries what the question does not say.
ALTER TABLE "assessments"
  ADD COLUMN "description" TEXT;

-- A test gains the same.
--
-- Distinct from the configuration's protocol notes, which say *how* the test is
-- carried out — loads, device settings, conditions. This says what it is for.
ALTER TABLE "assessment_modules"
  ADD COLUMN "description" TEXT;

-- When the test was first called finished, and when it was last reopened.
--
-- `completedAt` is the line dividing values recorded during the test from
-- values changed afterwards: a measurement ingested later than this was entered
-- after the coach called the test done. It is set on the first completion and
-- never moved — a second completion that reset it would erase precisely the
-- history it exists to make visible.
--
-- Not derivable from `status`: a reopened test is IN_PROGRESS again and would
-- otherwise be indistinguishable from one that was never finished.
--
-- Existing completed tests get no value. That is deliberate and truthful — the
-- moment they were completed was never recorded, and inventing one (createdAt,
-- updatedAt, the latest measurement) would put a timestamp in the record that
-- no one can vouch for. They read as "completed, no post-completion changes
-- known", which is the honest statement.
ALTER TABLE "assessment_modules"
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "reopenedAt" TIMESTAMP(3);

-- A note may be about one stage rather than the whole test.
--
-- Same shape and same reasoning as `measurements.passIndex`: a pass is a
-- structure inside the Module and never an entity, so the note points at the
-- module and names the pass instead of at a row that would have to exist for
-- it. Null means "about the test as a whole".
ALTER TABLE "notes"
  ADD COLUMN "passIndex" INTEGER;
