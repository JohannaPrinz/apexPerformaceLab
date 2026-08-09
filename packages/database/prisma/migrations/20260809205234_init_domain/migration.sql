-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'admin', 'coach', 'athlete');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('SINGLE_ASSESSMENT', 'ONGOING');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('INITIAL', 'RE_ASSESSMENT', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "MeasurementValueType" AS ENUM ('NUMERIC', 'TEXT', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "BodySide" AS ENUM ('LEFT', 'RIGHT', 'BILATERAL');

-- CreateEnum
CREATE TYPE "MeasurementSource" AS ENUM ('MANUAL', 'DEVICE', 'IMPORT', 'DERIVED');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "RecommendationAssignee" AS ENUM ('COACH', 'ATHLETE');

-- CreateEnum
CREATE TYPE "ReportScope" AS ENUM ('MODULE', 'ASSESSMENT', 'CASE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('DOCUMENT', 'VIDEO');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('CONSULTATION', 'TRAINING', 'ASSESSMENT', 'FOLLOW_UP', 'ONLINE_MEETING', 'RACE_SUPPORT', 'COMPETITION');

-- CreateEnum
CREATE TYPE "TimelineEntryKind" AS ENUM ('ASSESSMENT', 'REPORT', 'MEASUREMENT', 'DOCUMENT', 'VIDEO', 'PROGRAM', 'RECOMMENDATION', 'APPOINTMENT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "activeOrganizationId" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'coach',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'coach',
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaches" (
    "id" TEXT NOT NULL,
    "displayName" TEXT,
    "professionalTitle" TEXT,
    "bio" TEXT,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_credentials" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedAt" DATE,
    "expiresAt" DATE,
    "storageKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "coachId" TEXT NOT NULL,

    CONSTRAINT "coach_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athletes" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "email" TEXT,
    "phone" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "athletes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_cases" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "CaseType" NOT NULL DEFAULT 'ONGOING',
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "createdByCoachId" TEXT NOT NULL,

    CONSTRAINT "performance_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetDate" DATE,
    "achievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "type" "AssessmentType" NOT NULL DEFAULT 'INITIAL',
    "performedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_modules" (
    "id" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "moduleVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,

    CONSTRAINT "assessment_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "valueType" "MeasurementValueType" NOT NULL,
    "category" TEXT NOT NULL,
    "referenceMin" DECIMAL(12,4),
    "referenceMax" DECIMAL(12,4),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "measurement_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurements" (
    "id" TEXT NOT NULL,
    "side" "BodySide" NOT NULL DEFAULT 'BILATERAL',
    "numericValue" DECIMAL(12,4),
    "textValue" TEXT,
    "booleanValue" BOOLEAN,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "MeasurementSource" NOT NULL DEFAULT 'MANUAL',
    "externalSystem" TEXT,
    "externalId" TEXT,
    "organizationId" TEXT NOT NULL,
    "assessmentModuleId" TEXT NOT NULL,
    "measurementTypeId" TEXT NOT NULL,
    "supersededById" TEXT,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assessmentModuleId" TEXT NOT NULL,
    "authorCoachId" TEXT NOT NULL,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insight_measurements" (
    "insightId" TEXT NOT NULL,
    "measurementId" TEXT NOT NULL,

    CONSTRAINT "insight_measurements_pkey" PRIMARY KEY ("insightId","measurementId")
);

-- CreateTable
CREATE TABLE "insight_assets" (
    "insightId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "insight_assets_pkey" PRIMARY KEY ("insightId","assetId")
);

-- CreateTable
CREATE TABLE "insight_notes" (
    "insightId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,

    CONSTRAINT "insight_notes_pkey" PRIMARY KEY ("insightId","noteId")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
    "assignee" "RecommendationAssignee" NOT NULL DEFAULT 'ATHLETE',
    "dueDate" DATE,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assessmentModuleId" TEXT NOT NULL,
    "supersededById" TEXT,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_insights" (
    "recommendationId" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,

    CONSTRAINT "recommendation_insights_pkey" PRIMARY KEY ("recommendationId","insightId")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "scope" "ReportScope" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "content" JSONB,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorCoachId" TEXT NOT NULL,
    "assessmentModuleId" TEXT,
    "assessmentId" TEXT,
    "caseId" TEXT,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shares" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "createdByCoachId" TEXT NOT NULL,
    "reportId" TEXT,
    "assetId" TEXT,
    "programId" TEXT,
    "recommendationId" TEXT,
    "noteId" TEXT,

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "durationMs" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "caseId" TEXT,
    "assessmentId" TEXT,
    "assessmentModuleId" TEXT,
    "uploadedByCoachId" TEXT,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_annotations" (
    "id" TEXT NOT NULL,
    "timestampMs" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "authorCoachId" TEXT,

    CONSTRAINT "video_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "caseId" TEXT,
    "assessmentId" TEXT,
    "assessmentModuleId" TEXT,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorCoachId" TEXT,
    "athleteId" TEXT NOT NULL,
    "caseId" TEXT,
    "assessmentId" TEXT,
    "assessmentModuleId" TEXT,
    "appointmentId" TEXT,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "type" "AppointmentType" NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "meetingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByCoachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "caseId" TEXT,
    "assessmentId" TEXT,
    "assessmentModuleId" TEXT,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_entries" (
    "id" TEXT NOT NULL,
    "kind" "TimelineEntryKind" NOT NULL,
    "refId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,

    CONSTRAINT "timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_providerId_accountId_key" ON "accounts"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_slug_idx" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "memberships_organizationId_idx" ON "memberships"("organizationId");

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON "memberships"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "invitations_organizationId_idx" ON "invitations"("organizationId");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_organizationId_email_key" ON "invitations"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "coaches_userId_key" ON "coaches"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "coach_credentials_storageKey_key" ON "coach_credentials"("storageKey");

-- CreateIndex
CREATE INDEX "coach_credentials_coachId_idx" ON "coach_credentials"("coachId");

-- CreateIndex
CREATE UNIQUE INDEX "athletes_userId_key" ON "athletes"("userId");

-- CreateIndex
CREATE INDEX "athletes_organizationId_lastName_firstName_idx" ON "athletes"("organizationId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "performance_cases_organizationId_idx" ON "performance_cases"("organizationId");

-- CreateIndex
CREATE INDEX "performance_cases_athleteId_status_idx" ON "performance_cases"("athleteId", "status");

-- CreateIndex
CREATE INDEX "performance_cases_createdByCoachId_idx" ON "performance_cases"("createdByCoachId");

-- CreateIndex
CREATE INDEX "goals_organizationId_idx" ON "goals"("organizationId");

-- CreateIndex
CREATE INDEX "goals_caseId_idx" ON "goals"("caseId");

-- CreateIndex
CREATE INDEX "assessments_organizationId_idx" ON "assessments"("organizationId");

-- CreateIndex
CREATE INDEX "assessments_caseId_performedAt_idx" ON "assessments"("caseId", "performedAt");

-- CreateIndex
CREATE INDEX "assessment_modules_organizationId_idx" ON "assessment_modules"("organizationId");

-- CreateIndex
CREATE INDEX "assessment_modules_moduleKey_idx" ON "assessment_modules"("moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_modules_assessmentId_moduleKey_key" ON "assessment_modules"("assessmentId", "moduleKey");

-- CreateIndex
CREATE INDEX "measurement_types_organizationId_idx" ON "measurement_types"("organizationId");

-- CreateIndex
CREATE INDEX "measurement_types_category_idx" ON "measurement_types"("category");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_types_organizationId_key_key" ON "measurement_types"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "measurements_supersededById_key" ON "measurements"("supersededById");

-- CreateIndex
CREATE INDEX "measurements_organizationId_idx" ON "measurements"("organizationId");

-- CreateIndex
CREATE INDEX "measurements_assessmentModuleId_idx" ON "measurements"("assessmentModuleId");

-- CreateIndex
CREATE INDEX "measurements_measurementTypeId_capturedAt_idx" ON "measurements"("measurementTypeId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "measurements_organizationId_externalSystem_externalId_key" ON "measurements"("organizationId", "externalSystem", "externalId");

-- CreateIndex
CREATE INDEX "insights_organizationId_idx" ON "insights"("organizationId");

-- CreateIndex
CREATE INDEX "insights_assessmentModuleId_idx" ON "insights"("assessmentModuleId");

-- CreateIndex
CREATE INDEX "insight_measurements_measurementId_idx" ON "insight_measurements"("measurementId");

-- CreateIndex
CREATE INDEX "insight_assets_assetId_idx" ON "insight_assets"("assetId");

-- CreateIndex
CREATE INDEX "insight_notes_noteId_idx" ON "insight_notes"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "recommendations_supersededById_key" ON "recommendations"("supersededById");

-- CreateIndex
CREATE INDEX "recommendations_organizationId_idx" ON "recommendations"("organizationId");

-- CreateIndex
CREATE INDEX "recommendations_assessmentModuleId_idx" ON "recommendations"("assessmentModuleId");

-- CreateIndex
CREATE INDEX "recommendations_status_assignee_idx" ON "recommendations"("status", "assignee");

-- CreateIndex
CREATE INDEX "recommendation_insights_insightId_idx" ON "recommendation_insights"("insightId");

-- CreateIndex
CREATE INDEX "reports_organizationId_status_idx" ON "reports"("organizationId", "status");

-- CreateIndex
CREATE INDEX "reports_assessmentModuleId_idx" ON "reports"("assessmentModuleId");

-- CreateIndex
CREATE INDEX "reports_assessmentId_idx" ON "reports"("assessmentId");

-- CreateIndex
CREATE INDEX "reports_caseId_idx" ON "reports"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "shares_token_key" ON "shares"("token");

-- CreateIndex
CREATE INDEX "shares_organizationId_idx" ON "shares"("organizationId");

-- CreateIndex
CREATE INDEX "shares_reportId_idx" ON "shares"("reportId");

-- CreateIndex
CREATE INDEX "shares_assetId_idx" ON "shares"("assetId");

-- CreateIndex
CREATE INDEX "shares_programId_idx" ON "shares"("programId");

-- CreateIndex
CREATE INDEX "shares_recommendationId_idx" ON "shares"("recommendationId");

-- CreateIndex
CREATE INDEX "shares_noteId_idx" ON "shares"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "assets_storageKey_key" ON "assets"("storageKey");

-- CreateIndex
CREATE INDEX "assets_organizationId_athleteId_kind_idx" ON "assets"("organizationId", "athleteId", "kind");

-- CreateIndex
CREATE INDEX "assets_caseId_idx" ON "assets"("caseId");

-- CreateIndex
CREATE INDEX "assets_assessmentId_idx" ON "assets"("assessmentId");

-- CreateIndex
CREATE INDEX "assets_assessmentModuleId_idx" ON "assets"("assessmentModuleId");

-- CreateIndex
CREATE INDEX "video_annotations_organizationId_idx" ON "video_annotations"("organizationId");

-- CreateIndex
CREATE INDEX "video_annotations_assetId_timestampMs_idx" ON "video_annotations"("assetId", "timestampMs");

-- CreateIndex
CREATE INDEX "programs_organizationId_athleteId_idx" ON "programs"("organizationId", "athleteId");

-- CreateIndex
CREATE INDEX "programs_caseId_idx" ON "programs"("caseId");

-- CreateIndex
CREATE INDEX "programs_assessmentId_idx" ON "programs"("assessmentId");

-- CreateIndex
CREATE INDEX "notes_organizationId_athleteId_idx" ON "notes"("organizationId", "athleteId");

-- CreateIndex
CREATE INDEX "notes_caseId_idx" ON "notes"("caseId");

-- CreateIndex
CREATE INDEX "notes_assessmentId_idx" ON "notes"("assessmentId");

-- CreateIndex
CREATE INDEX "notes_assessmentModuleId_idx" ON "notes"("assessmentModuleId");

-- CreateIndex
CREATE INDEX "notes_appointmentId_idx" ON "notes"("appointmentId");

-- CreateIndex
CREATE INDEX "appointments_organizationId_athleteId_startsAt_idx" ON "appointments"("organizationId", "athleteId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_caseId_idx" ON "appointments"("caseId");

-- CreateIndex
CREATE INDEX "appointments_assessmentId_idx" ON "appointments"("assessmentId");

-- CreateIndex
CREATE INDEX "timeline_entries_organizationId_athleteId_occurredAt_idx" ON "timeline_entries"("organizationId", "athleteId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_entries_kind_refId_key" ON "timeline_entries"("kind", "refId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_credentials" ADD CONSTRAINT "coach_credentials_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_cases" ADD CONSTRAINT "performance_cases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_cases" ADD CONSTRAINT "performance_cases_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_cases" ADD CONSTRAINT "performance_cases_createdByCoachId_fkey" FOREIGN KEY ("createdByCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "performance_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "performance_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_modules" ADD CONSTRAINT "assessment_modules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_modules" ADD CONSTRAINT "assessment_modules_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_types" ADD CONSTRAINT "measurement_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_assessmentModuleId_fkey" FOREIGN KEY ("assessmentModuleId") REFERENCES "assessment_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_measurementTypeId_fkey" FOREIGN KEY ("measurementTypeId") REFERENCES "measurement_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "measurements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_assessmentModuleId_fkey" FOREIGN KEY ("assessmentModuleId") REFERENCES "assessment_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_authorCoachId_fkey" FOREIGN KEY ("authorCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_measurements" ADD CONSTRAINT "insight_measurements_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_measurements" ADD CONSTRAINT "insight_measurements_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "measurements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_assets" ADD CONSTRAINT "insight_assets_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_assets" ADD CONSTRAINT "insight_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_notes" ADD CONSTRAINT "insight_notes_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_notes" ADD CONSTRAINT "insight_notes_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_assessmentModuleId_fkey" FOREIGN KEY ("assessmentModuleId") REFERENCES "assessment_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_insights" ADD CONSTRAINT "recommendation_insights_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_insights" ADD CONSTRAINT "recommendation_insights_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_authorCoachId_fkey" FOREIGN KEY ("authorCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_assessmentModuleId_fkey" FOREIGN KEY ("assessmentModuleId") REFERENCES "assessment_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "performance_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_createdByCoachId_fkey" FOREIGN KEY ("createdByCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "performance_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assessmentModuleId_fkey" FOREIGN KEY ("assessmentModuleId") REFERENCES "assessment_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploadedByCoachId_fkey" FOREIGN KEY ("uploadedByCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_annotations" ADD CONSTRAINT "video_annotations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_annotations" ADD CONSTRAINT "video_annotations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_annotations" ADD CONSTRAINT "video_annotations_authorCoachId_fkey" FOREIGN KEY ("authorCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "performance_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_assessmentModuleId_fkey" FOREIGN KEY ("assessmentModuleId") REFERENCES "assessment_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_authorCoachId_fkey" FOREIGN KEY ("authorCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "performance_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_assessmentModuleId_fkey" FOREIGN KEY ("assessmentModuleId") REFERENCES "assessment_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_createdByCoachId_fkey" FOREIGN KEY ("createdByCoachId") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "performance_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assessmentModuleId_fkey" FOREIGN KEY ("assessmentModuleId") REFERENCES "assessment_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- INVARIANTS REQUIRING RAW SQL
--
-- Prisma cannot express CHECK constraints or partial unique indexes. These
-- statements live *inside* the migration so Prisma replays them into the shadow
-- database and reports no drift on the next migration.
--
-- Column names are camelCase and therefore double-quoted: the schema uses
-- @@map for tables only, no @map on any field.
--
-- Source of truth: the INVARIANTS block at the end of prisma/schema.prisma.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. measurement_types — system catalogue uniqueness.
--    Postgres treats NULLs as distinct, so @@unique([organizationId, key]) does
--    not prevent two system-wide types sharing a key.
CREATE UNIQUE INDEX "measurement_types_system_key_key"
  ON "measurement_types" ("key") WHERE "organizationId" IS NULL;

-- 2. measurements — exactly one value column is populated.
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_one_value"
  CHECK (num_nonnulls("numericValue", "textValue", "booleanValue") = 1);

-- 3. reports — exactly one scope target, matching `scope` (§16).
ALTER TABLE "reports" ADD CONSTRAINT "reports_scope_target"
  CHECK (
    ("scope" = 'MODULE'     AND "assessmentModuleId" IS NOT NULL
                            AND "assessmentId" IS NULL AND "caseId" IS NULL) OR
    ("scope" = 'ASSESSMENT' AND "assessmentId" IS NOT NULL
                            AND "assessmentModuleId" IS NULL AND "caseId" IS NULL) OR
    ("scope" = 'CASE'       AND "caseId" IS NOT NULL
                            AND "assessmentModuleId" IS NULL AND "assessmentId" IS NULL)
  );

-- 4. reports — one version number per scope target.
CREATE UNIQUE INDEX "reports_module_version_key"
  ON "reports" ("assessmentModuleId", "version") WHERE "assessmentModuleId" IS NOT NULL;
CREATE UNIQUE INDEX "reports_assessment_version_key"
  ON "reports" ("assessmentId", "version") WHERE "assessmentId" IS NOT NULL;
CREATE UNIQUE INDEX "reports_case_version_key"
  ON "reports" ("caseId", "version") WHERE "caseId" IS NOT NULL;

-- 5. reports — a published Report carries its snapshot (§16).
--    `content` is written once on publication; a PUBLISHED or ARCHIVED row
--    without it would be an empty document the athlete may already hold.
ALTER TABLE "reports" ADD CONSTRAINT "reports_published_has_content"
  CHECK ("status" = 'DRAFT'
         OR ("content" IS NOT NULL AND "publishedAt" IS NOT NULL));

-- 6. shares — exactly one target (§17).
ALTER TABLE "shares" ADD CONSTRAINT "shares_one_target"
  CHECK (num_nonnulls("reportId", "assetId", "programId",
                      "recommendationId", "noteId") = 1);

-- 7. coaches — an unlinked profile is a tombstone (§6).
--    `userId` is nulled when a Coach deletes their profile. A row without a
--    user and without `deletedAt` would be neither active nor deleted.
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_unlinked_is_deleted"
  CHECK ("userId" IS NOT NULL OR "deletedAt" IS NOT NULL);
