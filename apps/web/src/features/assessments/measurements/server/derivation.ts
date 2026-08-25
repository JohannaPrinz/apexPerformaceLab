import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  calculateBodyFat,
  readModuleConfiguration,
  SKINFOLD_SITE_KEYS,
  type BodyFatOutcome,
  type BodyFatMethod,
  type SkinfoldSiteKey,
} from '@apex/domain';
import type { TenantContext } from '@apex/types';

/**
 * Values a test computes rather than asks for.
 *
 * ## Why this is a write and not a display
 *
 * A body-fat percentage is a **finding**, not a rendering. It has to sit in the
 * record beside the folds it came from, be readable by every screen that reads
 * measurements, and stay comparable across a season — which means it is a
 * Measurement of the `body_fat` type like any other, with `source: DERIVED` to
 * say where it came from. Computing it in the overview instead would leave the
 * number out of the record entirely and out of every chart.
 *
 * ## Why recomputing supersedes rather than updates
 *
 * A measurement is never edited (§13). If a fold is corrected the percentage
 * that followed from the old fold is not wrong-and-fixed, it is superseded —
 * exactly as `correctMeasurement` treats a coach's correction. The supersede
 * chain then shows both, which is what an audit of a health record needs.
 *
 * ## What it refuses to do
 *
 * Nothing is written unless the method's every fold is present **and** the
 * athlete's sex and date of birth are known. The refusal travels with a reason,
 * so the screen can say what is missing instead of showing a silent absence.
 * Guessing a sex, an age, or a missing fold would put a number in a health
 * record that no method produced.
 */

type DerivationDb = Pick<
  PrismaClientInstance,
  'measurement' | 'assessmentModule' | 'measurementType' | '$transaction'
>;

export interface DerivedValueState {
  readonly measurementTypeId: string;
  readonly method: BodyFatMethod;
  /** The outcome as of now — the value, or the reason there is none. */
  readonly outcome: BodyFatOutcome;
  /** The standing derived measurement, where one has been written. */
  readonly measurementId: string | null;
  /**
   * What that standing measurement says.
   *
   * Carried beside the outcome so a refusal does not hide a finding: a
   * percentage computed last month from a profile that has since lost its date
   * of birth is still in the record, and a screen showing only "cannot
   * calculate" would make it look as though nothing had ever been measured.
   */
  readonly storedPercent: number | null;
  /** The day the folds were taken, and so the day the age was read on. */
  readonly measuredAt: Date | null;
}

const skinfoldKeys = new Set<string>(SKINFOLD_SITE_KEYS);

/** The standing derived row for one quantity, if this test has written one. */
const standingFor = <TRow extends { measurementTypeId: string; source: string }>(
  rows: readonly TRow[],
  measurementTypeId: string,
): TRow | undefined =>
  rows.find((row) => row.measurementTypeId === measurementTypeId && row.source === 'DERIVED');

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Everything a derivation needs, read once.
 *
 * `null` when the module is outside the workspace or unreadable — the same
 * answer every other read in this slice gives, so a caller cannot tell a
 * missing test from someone else's.
 */
async function loadContext(
  db: DerivationDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
) {
  const assessmentModule = await db.assessmentModule.findFirst({
    where: scoped(tenant, { id: moduleId }),
    select: {
      id: true,
      payload: true,
      moduleVersion: true,
      assessment: {
        select: {
          case: {
            select: {
              athlete: { select: { sex: true, dateOfBirth: true } },
            },
          },
        },
      },
    },
  });

  if (!assessmentModule) return null;

  const configuration = readModuleConfiguration(
    assessmentModule.payload,
    assessmentModule.moduleVersion,
  );

  const derivations = configuration?.derivations ?? [];
  if (derivations.length === 0) return null;

  // Only what still stands: a superseded fold is history, and a percentage must
  // follow from the folds that are current (§13).
  const rows = await db.measurement.findMany({
    where: scoped(tenant, { assessmentModuleId: moduleId, supersededById: null }),
    select: {
      id: true,
      measurementTypeId: true,
      numericValue: true,
      capturedAt: true,
      source: true,
      measurementType: { select: { key: true } },
    },
    orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
  });

  const folds: Partial<Record<SkinfoldSiteKey, number>> = {};
  let foldsTakenAt: Date | null = null;

  for (const row of rows) {
    if (!skinfoldKeys.has(row.measurementType.key) || row.numericValue === null) continue;

    folds[row.measurementType.key as SkinfoldSiteKey] = Number(row.numericValue);
    // The day the folds were taken, which is the day the age is read on. The
    // last of them: a sheet finished on Tuesday was measured on Tuesday.
    foldsTakenAt = row.capturedAt;
  }

  return {
    athlete: assessmentModule.assessment.case.athlete,
    derivations,
    folds,
    foldsTakenAt,
    standing: rows,
  };
}

/**
 * What each of this test's computed quantities currently amounts to.
 *
 * Read-only. The overview uses it to show the percentage **and** to say why
 * there is none — the two answers come from the same function so the screen
 * cannot describe a state the writer would not produce.
 */
export async function derivedValues(
  db: DerivationDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
): Promise<readonly DerivedValueState[]> {
  const context = await loadContext(db, tenant, moduleId);
  if (context === null) return [];

  return context.derivations.map((derivation) => ({
    measurementTypeId: derivation.measurementTypeId,
    method: derivation.method,
    outcome: calculateBodyFat({
      method: derivation.method,
      sex: context.athlete.sex,
      dateOfBirth: context.athlete.dateOfBirth,
      // No folds yet means no measurement day either; the refusal is then the
      // missing folds, which is the more useful thing to say.
      measuredAt: context.foldsTakenAt ?? new Date(),
      folds: context.folds,
    }),
    measurementId: standingFor(context.standing, derivation.measurementTypeId)?.id ?? null,
    storedPercent: numberOrNull(
      standingFor(context.standing, derivation.measurementTypeId)?.numericValue,
    ),
    measuredAt: context.foldsTakenAt,
  }));
}

/**
 * Brings the computed values in line with the folds that stand.
 *
 * Called after anything that changes this test's measurements. Idempotent: a
 * percentage that already matches is left exactly as it is, so saving a stage
 * twice does not produce a supersede chain of identical numbers.
 */
export async function refreshDerivedMeasurements(
  db: DerivationDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
): Promise<void> {
  const states = await derivedValues(db, tenant, moduleId);

  for (const state of states) {
    // Nothing to write, and — deliberately — nothing to remove. A percentage
    // already in the record was computed from what stood at the time; if the
    // athlete's sex is unstated today, or a fold no longer supports the method,
    // that is a reason not to produce a *new* number, not a licence to erase a
    // finding. The read reports the value and the refusal side by side, so the
    // screen can say the value can no longer be recomputed.
    if (!state.outcome.ok || state.measuredAt === null) continue;

    const value = state.outcome.value;
    const measuredAt = state.measuredAt;

    const standing =
      state.measurementId === null
        ? null
        : await db.measurement.findFirst({
            where: scoped(tenant, { id: state.measurementId }),
            select: { id: true, numericValue: true },
          });

    // Unchanged: nothing to write, and writing anyway would fill the record
    // with a chain of identical percentages every time a stage is saved.
    if (standing !== null && Number(standing.numericValue) === value.bodyFatPercent) continue;

    await db.$transaction(async (tx) => {
      const created = await tx.measurement.create({
        data: withTenant(tenant, {
          assessmentModuleId: moduleId,
          measurementTypeId: state.measurementTypeId,
          side: 'BILATERAL',
          passIndex: null,
          capturedAt: measuredAt,
          source: 'DERIVED',
          numericValue: value.bodyFatPercent,
          note: derivationNote(value.method, value.sum, value.age),
        }),
        select: { id: true },
      });

      if (standing !== null) {
        await tx.measurement.updateMany({
          where: scoped(tenant, { id: standing.id, supersededById: null }),
          data: { supersededById: created.id },
        });
      }
    });
  }
}

/**
 * What the value was computed from, in the note beside it.
 *
 * The sum and the age are the two inputs a coach cannot read off the screen
 * afterwards — the folds are visible, but their sum and the age on the day are
 * what the equation actually consumed. Stating them makes the number checkable
 * instead of merely present.
 */
function derivationNote(method: BodyFatMethod, sum: number, age: number): string {
  const name =
    method === 'jackson_pollock_3' ? 'Jackson & Pollock, 3 Punkte' : 'Jackson & Pollock, 7 Punkte';

  return `Berechnet · ${name} · Faltensumme ${String(sum)} mm · Alter ${String(age)}`;
}
