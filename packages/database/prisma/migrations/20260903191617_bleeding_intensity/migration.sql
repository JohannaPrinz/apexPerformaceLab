-- CreateEnum
CREATE TYPE "BleedingIntensity" AS ENUM ('SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY');

-- AlterTable
ALTER TABLE "bleeding_episodes" ADD COLUMN     "intensity" "BleedingIntensity";
