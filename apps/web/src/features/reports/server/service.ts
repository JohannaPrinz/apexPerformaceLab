import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  combineReadiness,
  evaluateReadiness,
  moduleConfigurationSchema,
  type Readiness,
  type ReadinessLevel,
} from '@apex/domain';
import type { TenantContext } from '@apex/types';

import type { CreateReportInput } from '../schemas';

/**
 * Analyses.
 *
 * An analysis is a `Report` — §16's one object with a scope, not a second
 * conclusion-object beside it. What this slice adds is `ReportModule`: which
 * tests the analysis draws on, and which the coach set aside.
 *
 * **The inclusion decision belongs to the analysis, never to the test.** It is
 * a row keyed by `(reportId, assessmentModuleId)`, so excluding a test from one
 * analysis leaves it untouched in every other — structurally, not by a rule
 * somebody has to remember. The module's own `status` is never written here.
 */

type ReportDb = Pick<
  PrismaClientInstance,
  'report' | 'reportModule' | 'assessment' | 'assessmentModule' | 'measurement'
>;

const reportSelect = {
  id: true,
  title: true,
  scope: true,
  status: true,
  version: true,
  publishedAt: true,
  createdAt: true,
  assessmentId: true,
  authorCoachId: true,
} as const;

export interface ReportRecord {
  id: string;
  title: string;
  scope: 'MODULE' | 'ASSESSMENT' | 'CASE';
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  version: number;
  publishedAt: Date | null;
  createdAt: Date;
  assessmentId: string | null;
  authorCoachId: string;
}

/**
 * Creates a draft analysis over an assessment.
 *
 * Every test of the assessment starts **included**: an analysis of an
 * examination naturally covers what was examined, and the coach sets aside what
 * does not belong. Writing the rows explicitly rather than relying on their
 * absence means "excluded" and "not yet decided" stay distinguishable.
 *
 * The version is the next free one for this assessment — a partial unique index
 * enforces one version per scope target, so this is the only place that has to
 * count.
 */
export async function createReport(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  authorCoachId: string,
  { assessmentId, title }: CreateReportInput,
): Promise<ReportRecord | null> {
  const assessment = await db.assessment.findFirst({
    where: scoped(tenant, { id: assessmentId }),
    select: { id: true, modules: { select: { id: true } } },
  });

  if (!assessment) return null;

  const latest = await db.report.findFirst({
    where: scoped(tenant, { assessmentId }),
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  return db.report.create({
    data: withTenant(tenant, {
      assessmentId,
      authorCoachId,
      title,
      scope: 'ASSESSMENT' as const,
      version: (latest?.version ?? 0) + 1,
      modules: {
        create: assessment.modules.map((entry) => ({
          organizationId: tenant.organizationId,
          assessmentModuleId: entry.id,
          included: true,
        })),
      },
    }),
    select: reportSelect,
  });
}

export async function listReportsForAssessment(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assessmentId: string,
): Promise<ReportRecord[]> {
  return db.report.findMany({
    where: scoped(tenant, { assessmentId }),
    select: reportSelect,
    orderBy: [{ version: 'desc' }],
  });
}

/**
 * Includes or excludes one test for this analysis.
 *
 * Upserted, because the row may not exist for a test added after the analysis
 * was created. Nothing about the module is written — its status, its
 * measurements and every other analysis are untouched.
 */
export async function setReportModuleInclusion(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  reportId: string,
  moduleId: string,
  included: boolean,
): Promise<boolean> {
  const [report, assessmentModule] = await Promise.all([
    db.report.findFirst({ where: scoped(tenant, { id: reportId }), select: { id: true } }),
    db.assessmentModule.findFirst({
      where: scoped(tenant, { id: moduleId }),
      select: { id: true },
    }),
  ]);

  if (!report || !assessmentModule) return false;

  await db.reportModule.upsert({
    where: { reportId_assessmentModuleId: { reportId, assessmentModuleId: moduleId } },
    update: { included },
    create: withTenant(tenant, { reportId, assessmentModuleId: moduleId, included }),
  });

  return true;
}

export interface ReportReadiness {
  readonly level: ReadinessLevel;
  readonly modules: readonly {
    moduleId: string;
    moduleKey: string;
    included: boolean;
    status: string;
    readiness: Readiness;
  }[];
}

/**
 * Whether an analysis has the data it needs.
 *
 * Three inputs, exactly as required: the test's status, the measurements
 * present, and the coach's inclusion decision. They are combined in that order
 * of independence — **the status does not decide readiness**, it only says how
 * far the coach got; readiness is computed from what was recorded; and an
 * excluded test contributes nothing either way.
 *
 * Nothing is filled in. A gap is reported and named.
 */
export async function reportReadiness(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  reportId: string,
): Promise<ReportReadiness | null> {
  const report = await db.report.findFirst({
    where: scoped(tenant, { id: reportId }),
    select: {
      id: true,
      modules: {
        select: {
          included: true,
          assessmentModule: {
            select: { id: true, moduleKey: true, payload: true, status: true },
          },
        },
      },
    },
  });

  if (!report) return null;

  const measurements = await db.measurement.findMany({
    where: scoped(tenant, {
      assessmentModuleId: { in: report.modules.map((entry) => entry.assessmentModule.id) },
    }),
    select: {
      assessmentModuleId: true,
      measurementTypeId: true,
      passIndex: true,
      supersededById: true,
    },
  });

  const modules = report.modules.map((entry) => {
    const parsed = moduleConfigurationSchema.safeParse(entry.assessmentModule.payload);
    const own = measurements.filter(
      (measurement) => measurement.assessmentModuleId === entry.assessmentModule.id,
    );

    return {
      moduleId: entry.assessmentModule.id,
      moduleKey: entry.assessmentModule.moduleKey,
      included: entry.included,
      status: entry.assessmentModule.status,
      readiness: parsed.success
        ? evaluateReadiness(parsed.data, own)
        : {
            level: 'INSUFFICIENT' as const,
            missingTypeIds: [],
            missingPasses: [],
            expected: 0,
            recorded: 0,
          },
    };
  });

  return {
    level: combineReadiness(
      modules.filter((entry) => entry.included).map((entry) => entry.readiness),
    ),
    modules,
  };
}
