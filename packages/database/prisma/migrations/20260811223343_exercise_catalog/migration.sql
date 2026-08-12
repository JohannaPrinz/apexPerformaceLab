-- AlterTable
ALTER TABLE "measurements" ADD COLUMN     "exerciseId" TEXT;

-- CreateTable
CREATE TABLE "exercises" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "muscleGroups" TEXT[],
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,
    "createdByCoachId" TEXT,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercises_organizationId_idx" ON "exercises"("organizationId");

-- CreateIndex
CREATE INDEX "exercises_createdByCoachId_idx" ON "exercises"("createdByCoachId");

-- CreateIndex
CREATE UNIQUE INDEX "exercises_organizationId_key_key" ON "exercises"("organizationId", "key");

-- CreateIndex
CREATE INDEX "measurements_exerciseId_idx" ON "measurements"("exerciseId");

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_createdByCoachId_fkey" FOREIGN KEY ("createdByCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariants Prisma cannot express (see the notes at the end of schema.prisma).
-- Appended here rather than run separately so that Prisma replays them into the
-- shadow database and reports no drift on the next migration.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1b. System catalogue uniqueness.
-- Postgres treats NULLs as distinct, so the unique index on
-- ("organizationId", "key") above does not stop two system exercises sharing a
-- key. Same arrangement as measurement_types_system_key_key.
CREATE UNIQUE INDEX "exercises_system_key_key"
  ON "exercises" ("key") WHERE "organizationId" IS NULL;

-- 1c. A system exercise has no author, a workspace exercise always has one.
-- A row whose scope and provenance disagree would be neither.
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_system_has_no_author"
  CHECK (("organizationId" IS NULL) = ("createdByCoachId" IS NULL));
