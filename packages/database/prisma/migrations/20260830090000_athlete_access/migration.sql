-- Which coaches may see an athlete besides the one who records them (§7).
--
-- Until now every coach of a workspace saw every athlete in it, so releasing an
-- athlete had nothing to grant. Ownership already existed as
-- `athletes.createdByCoachId`; this table is the other half — the named
-- exceptions to it.
--
-- A row with `confirmedAt` still NULL is a standing offer and grants nothing:
-- an athlete's record is theirs before it is the workspace's. Revoking deletes
-- the row, because this is a permission and not a history.
--
-- Purely additive: no existing table, column or row is touched. Reversal is
-- `DROP TABLE "athlete_accesses";`.

-- CreateTable
CREATE TABLE "athlete_accesses" (
    "id" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByCoachId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "grantedByCoachId" TEXT NOT NULL,

    CONSTRAINT "athlete_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "athlete_accesses_organizationId_coachId_idx" ON "athlete_accesses"("organizationId", "coachId");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_accesses_athleteId_coachId_key" ON "athlete_accesses"("athleteId", "coachId");

-- AddForeignKey
ALTER TABLE "athlete_accesses" ADD CONSTRAINT "athlete_accesses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_accesses" ADD CONSTRAINT "athlete_accesses_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_accesses" ADD CONSTRAINT "athlete_accesses_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_accesses" ADD CONSTRAINT "athlete_accesses_grantedByCoachId_fkey" FOREIGN KEY ("grantedByCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

