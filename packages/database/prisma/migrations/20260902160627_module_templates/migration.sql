-- CreateTable
CREATE TABLE "module_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "moduleVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByCoachId" TEXT NOT NULL,

    CONSTRAINT "module_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "module_templates_organizationId_moduleKey_idx" ON "module_templates"("organizationId", "moduleKey");

-- AddForeignKey
ALTER TABLE "module_templates" ADD CONSTRAINT "module_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_templates" ADD CONSTRAINT "module_templates_createdByCoachId_fkey" FOREIGN KEY ("createdByCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
