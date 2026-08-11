-- DropIndex
DROP INDEX "measurements_assessmentModuleId_idx";

-- AlterTable
ALTER TABLE "measurements" ADD COLUMN     "context" JSONB,
ADD COLUMN     "passIndex" INTEGER;

-- CreateIndex
CREATE INDEX "measurements_assessmentModuleId_passIndex_idx" ON "measurements"("assessmentModuleId", "passIndex");
