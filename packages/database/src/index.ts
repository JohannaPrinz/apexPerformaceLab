export { db, PrismaClient, type PrismaClientInstance } from './client';
export * from './tenant';

/**
 * Re-exported generated model & enum types.
 *
 * Consumers import database types from `@apex/database` rather than reaching
 * into `generated/`, so the generator's output path stays an implementation
 * detail we can change without touching call sites.
 *
 * Prisma 7's `prisma-client` generator suffixes model types with `Model`
 * (`AthleteModel`). They are aliased back to the bare model name here — that
 * suffix is a generator convention, not part of our domain vocabulary.
 *
 * This list must cover every `model` and `enum` in `prisma/schema.prisma`.
 * A missing entry produces no error until the first import that needs it, so
 * `src/exports.test.ts` compares both sides mechanically.
 */
export type {
  // ── Identity (Better Auth) ─────────────────────────────────────────────────
  UserModel as User,
  SessionModel as Session,
  AccountModel as Account,
  VerificationModel as Verification,

  // ── Tenancy ────────────────────────────────────────────────────────────────
  OrganizationModel as Organization,
  MembershipModel as Membership,
  InvitationModel as Invitation,

  // ── Coach ──────────────────────────────────────────────────────────────────
  // Organisation-independent by design (§6): affiliation is a Membership.
  CoachModel as Coach,
  CoachCredentialModel as CoachCredential,

  // ── Canonical hierarchy (§3) ───────────────────────────────────────────────
  // Athlete → Performance Case → Assessment → Module → Measurement
  AthleteModel as Athlete,
  PerformanceCaseModel as PerformanceCase,
  GoalModel as Goal,
  AssessmentModel as Assessment,
  AssessmentModuleModel as AssessmentModule,
  MeasurementTypeModel as MeasurementType,
  MeasurementModel as Measurement,

  // ── Interpretation ─────────────────────────────────────────────────────────
  InsightModel as Insight,
  RecommendationModel as Recommendation,

  // ── Evidence (§14) ─────────────────────────────────────────────────────────
  // Identity-free join tables with composite primary keys — relations, not
  // entities. Exported because queries select through them.
  InsightMeasurementModel as InsightMeasurement,
  InsightAssetModel as InsightAsset,
  InsightNoteModel as InsightNote,
  RecommendationInsightModel as RecommendationInsight,

  // ── Reporting (§16, §17) ───────────────────────────────────────────────────
  ReportModel as Report,
  ReportModuleModel as ReportModule,
  ShareModel as Share,

  // ── Supporting objects ─────────────────────────────────────────────────────
  AssetModel as Asset,
  VideoAnnotationModel as VideoAnnotation,
  ProgramModel as Program,
  NoteModel as Note,
  AppointmentModel as Appointment,

  // ── Cross-cutting ──────────────────────────────────────────────────────────
  TimelineEntryModel as TimelineEntry,
} from '../generated/prisma/models';

/**
 * Enums are exported as values, not just types — call sites compare against
 * their members (`status === CaseStatus.ACTIVE`).
 *
 * They mirror the Zod enums in `@apex/types`, which are the source of truth for
 * the API surface. Change both together.
 */
export {
  // Tenancy
  MembershipRole,
  InvitationStatus,

  // Case
  CaseType,
  CaseStatus,

  // Assessment & measurement
  AssessmentType,
  AssessmentModuleStatus,
  MeasurementValueType,
  BodySide,
  MeasurementSource,

  // Recommendation
  RecommendationStatus,
  RecommendationAssignee,

  // Reporting
  ReportScope,
  ReportStatus,

  // Supporting objects
  AssetKind,
  AppointmentType,

  // Cross-cutting
  TimelineEntryKind,
} from '../generated/prisma/enums';
