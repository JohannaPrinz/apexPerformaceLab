-- Exercise catalogue: the structure a full catalogue will be imported into.
--
-- `muscleGroups` is replaced rather than migrated: it held free text by an
-- earlier decision, the column was empty on every row, and the vocabulary it
-- would map onto does not exist yet. Verified before writing this migration —
-- six system exercises, all with an empty list, no measurement referencing any
-- of them.

-- AlterTable
ALTER TABLE "exercises" DROP COLUMN "muscleGroups",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "difficulty" TEXT,
ADD COLUMN     "equipment" TEXT[],
ADD COLUMN     "forceType" TEXT,
ADD COLUMN     "instructions" TEXT[],
ADD COLUMN     "license" TEXT,
ADD COLUMN     "mechanic" TEXT,
ADD COLUMN     "media" JSONB,
ADD COLUMN     "primaryMuscles" TEXT[],
ADD COLUMN     "secondaryMuscles" TEXT[],
ADD COLUMN     "source" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "unilateral" BOOLEAN NOT NULL DEFAULT false;

-- `canonicalName` is required, and the table already holds rows.
--
-- Added with a temporary default, backfilled from `name`, then the default is
-- dropped so no future row can acquire one silently. The backfill is exact
-- rather than a placeholder: the six existing rows carry the English name in
-- `name` — which is precisely what `canonicalName` is for. The seed then writes
-- the German display name into `name`.
ALTER TABLE "exercises" ADD COLUMN "canonicalName" TEXT NOT NULL DEFAULT '';
UPDATE "exercises" SET "canonicalName" = "name" WHERE "canonicalName" = '';
ALTER TABLE "exercises" ALTER COLUMN "canonicalName" DROP DEFAULT;

-- CreateTable
CREATE TABLE "exercise_variants" (
    "exerciseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_variants_pkey" PRIMARY KEY ("exerciseId","variantId")
);

-- CreateIndex
CREATE INDEX "exercise_variants_variantId_idx" ON "exercise_variants"("variantId");

-- CreateIndex
CREATE INDEX "exercise_variants_organizationId_idx" ON "exercise_variants"("organizationId");

-- CreateIndex
CREATE INDEX "exercises_canonicalName_idx" ON "exercises"("canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "exercises_organizationId_source_sourceId_key" ON "exercises"("organizationId", "source", "sourceId");

-- AddForeignKey
ALTER TABLE "exercise_variants" ADD CONSTRAINT "exercise_variants_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_variants" ADD CONSTRAINT "exercise_variants_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_variants" ADD CONSTRAINT "exercise_variants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariant Prisma cannot express (see the notes at the end of schema.prisma).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1d. One row per pair, never a self-link.
-- The relation is symmetric and stored once, with the smaller id first. Without
-- this, the same pair could exist twice in opposite order and "the variants of
-- X" would return duplicates.
ALTER TABLE "exercise_variants" ADD CONSTRAINT "exercise_variants_ordered"
  CHECK ("exerciseId" < "variantId");
