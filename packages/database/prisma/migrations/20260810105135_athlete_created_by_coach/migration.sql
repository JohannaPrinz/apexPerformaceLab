-- AlterTable
ALTER TABLE "athletes" ADD COLUMN     "createdByCoachId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "athletes_createdByCoachId_idx" ON "athletes"("createdByCoachId");

-- AddForeignKey
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_createdByCoachId_fkey" FOREIGN KEY ("createdByCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
