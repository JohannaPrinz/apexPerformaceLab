-- CreateTable
CREATE TABLE "athlete_activations" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "issuedByCoachId" TEXT NOT NULL,

    CONSTRAINT "athlete_activations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "athlete_activations_tokenHash_key" ON "athlete_activations"("tokenHash");

-- CreateIndex
CREATE INDEX "athlete_activations_organizationId_athleteId_idx" ON "athlete_activations"("organizationId", "athleteId");

-- CreateIndex
CREATE INDEX "athlete_activations_issuedByCoachId_idx" ON "athlete_activations"("issuedByCoachId");

-- AddForeignKey
ALTER TABLE "athlete_activations" ADD CONSTRAINT "athlete_activations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_activations" ADD CONSTRAINT "athlete_activations_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_activations" ADD CONSTRAINT "athlete_activations_issuedByCoachId_fkey" FOREIGN KEY ("issuedByCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
