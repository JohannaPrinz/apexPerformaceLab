-- CreateEnum
CREATE TYPE "AssetAnalysisStatus" AS ENUM ('RUNNING', 'FINISHED', 'FAILED');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "analysisExpiresAt" TIMESTAMP(3),
ADD COLUMN     "analysisStatus" "AssetAnalysisStatus";

-- CreateIndex
CREATE INDEX "assets_analysisStatus_analysisExpiresAt_idx" ON "assets"("analysisStatus", "analysisExpiresAt");
