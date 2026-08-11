-- CreateEnum
CREATE TYPE "AssessmentModuleStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'ABORTED');

-- AlterTable
ALTER TABLE "assessment_modules" ADD COLUMN     "createdByCoachId" TEXT NOT NULL,
ADD COLUMN     "status" "AssessmentModuleStatus" NOT NULL DEFAULT 'PLANNED';

-- CreateTable
CREATE TABLE "report_modules" (
    "included" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "assessmentModuleId" TEXT NOT NULL,

    CONSTRAINT "report_modules_pkey" PRIMARY KEY ("reportId","assessmentModuleId")
);

-- CreateIndex
CREATE INDEX "report_modules_organizationId_idx" ON "report_modules"("organizationId");

-- CreateIndex
CREATE INDEX "report_modules_assessmentModuleId_idx" ON "report_modules"("assessmentModuleId");

-- CreateIndex
CREATE INDEX "assessment_modules_createdByCoachId_idx" ON "assessment_modules"("createdByCoachId");

-- AddForeignKey
ALTER TABLE "assessment_modules" ADD CONSTRAINT "assessment_modules_createdByCoachId_fkey" FOREIGN KEY ("createdByCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_modules" ADD CONSTRAINT "report_modules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_modules" ADD CONSTRAINT "report_modules_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_modules" ADD CONSTRAINT "report_modules_assessmentModuleId_fkey" FOREIGN KEY ("assessmentModuleId") REFERENCES "assessment_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
