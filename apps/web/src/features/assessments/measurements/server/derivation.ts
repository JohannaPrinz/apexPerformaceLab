import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  calculateBodyFat,
  calculateEnergyIntake,
  ENERGY_NUTRIENT_KEYS,
  readModuleConfiguration,
  SKINFOLD_SITE_KEYS,
  type DerivationMethod,
  type EnergyNutrientKey,
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
 *
 * ## Why one mechanism and not one per quantity
 *
 * A body-fat percentage and a day's energy total are computed from different
 * inputs by different published procedures, and they are the *same kind of
 * thing*: a value this test produces rather than asks for, written as a
 * `DERIVED` measurement, superseded when its inputs change, refused with a
 * reason when the inputs are incomplete. Only the equation differs, so only the
 * equation branches — everything around it is shared, which is what keeps a
 * second derived quantity from acquiring a second set of rules about when a
 * value may be written.
 */

type DerivationDb = Pick<
  PrismaClientInstance,
  'measurement' | 'assessmentModule' | 'measurementType' | '$transaction'
>;

/**
 * What one equation produced, in terms every derived quantity shares.
 *
 * `inputs` is the line a coach cannot reconstruct from the screen — the fold
 * sum and the age for a skinfold method, the three macronutrients for an energy
 * total. Stating it makes the number checkable instead of merely present, which
 * is the whole reason the note beside the stored measurement exists.
 */
export type DerivedOutcome =
  | {
      readonly ok: true;
      readonly value: number;
      readonly inputs: string;
    }
  | {
      readonly ok: false;
      readonly refusal: { readonly reason: string; readonly missing?: readonly string[] };
    };

export interface DerivedValueState {
  readonly measurementTypeId: string;
  readonly method: DerivationMethod;
  /** The outcome as of now — the value, or the reason there is none. */
  readonly outcome: DerivedOutcome;
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
  readonly storedValue: number | null;
  /** The day the inputs were taken, and so the day the age was read on. */
  readonly measuredAt: Date | null;
}

const skinfoldKeys = new Set<string>(SKINFOLD_SITE_KEYS);
const nutrientKeys = new Set<string>(ENERGY_NUTRIENT_KEYS);

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
  const nutrients: Partial<Record<EnergyNutrientKey, number>> = {};
  let foldsTakenAt: Date | null = null;
  let nutrientsTakenAt: Date | null = null;

  for (const row of rows) {
    if (row.numericValue === null) continue;
    const key = row.measurementType.key;

    if (skinfoldKeys.has(key)) {
      folds[key as SkinfoldSiteKey] = Number(row.numericValue);
      // The day the folds were taken, which is the day the age is read on. The
      // last of them: a sheet finished on Tuesday was measured on Tuesday.
      foldsTakenAt = row.capturedAt;
      continue;
    }

    if (nutrientKeys.has(key)) {
      nutrients[key as EnergyNutrientKey] = Number(row.numericValue);
      nutrientsTakenAt = row.capturedAt;
    }
  }

  return {
    athlete: assessmentModule.assessment.case.athlete,
    derivations,
    folds,
    foldsTakenAt,
    nutrients,
    nutrientsTakenAt,
    standing: rows,
  };
}

/**
 * One derivation, evaluated against what this test currently holds.
 *
 * The branch is the only place a method's identity matters. Everything the
 * caller does with the answer — writing it, superseding an older one, telling
 * the screen why there is none — is the same whichever branch produced it.
 */
function evaluate(
  method: DerivationMethod,
  context: NonNullable<Awaited<ReturnType<typeof loadContext>>>,
): { readonly outcome: DerivedOutcome; readonly measuredAt: Date | null } {
  if (method === 'atwater_energy') {
    const outcome = calculateEnergyIntake(context.nutrients);

    return {
      outcome: outcome.ok
        ? {
            ok: true,
            value: outcome.value.energyKcal,
            inputs: energyInputs(context.nutrients),
          }
        : { ok: false, refusal: outcome.refusal },
      measuredAt: context.nutrientsTakenAt,
    };
  }

  const outcome = calculateBodyFat({
    method,
    sex: context.athlete.sex,
    dateOfBirth: context.athlete.dateOfBirth,
    // No folds yet means no measurement day either; the refusal is then the
    // missing folds, which is the more useful thing to say.
    measuredAt: context.foldsTakenAt ?? new Date(),
    folds: context.folds,
  });

  return {
    outcome: outcome.ok
      ? {
          ok: true,
          value: outcome.value.bodyFatPercent,
          inputs: bodyFatInputs(outcome.value.method, outcome.value.sum, outcome.value.age),
        }
      : { ok: false, refusal: outcome.refusal },
    measuredAt: context.foldsTakenAt,
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

  return context.derivations.map((derivation) => {
    const { outcome, measuredAt } = evaluate(derivation.method, context);

    return {
      measurementTypeId: derivation.measurementTypeId,
      method: derivation.method,
      outcome,
      measurementId: standingFor(context.standing, derivation.measurementTypeId)?.id ?? null,
      storedValue: numberOrNull(
        standingFor(context.standing, derivation.measurementTypeId)?.numericValue,
      ),
      measuredAt,
    };
  });
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

    const { value, inputs } = state.outcome;
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
    if (standing !== null && Number(standing.numericValue) === value) continue;

    await db.$transaction(async (tx) => {
      const created = await tx.measurement.create({
        data: withTenant(tenant, {
          assessmentModuleId: moduleId,
          measurementTypeId: state.measurementTypeId,
          side: 'BILATERAL',
          passIndex: null,
          capturedAt: measuredAt,
          source: 'DERIVED',
          numericValue: value,
          note: `Berechnet · ${inputs}`,
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
function bodyFatInputs(method: DerivationMethod, sum: number, age: number): string {
  const name =
    method === 'jackson_pollock_3' ? 'Jackson & Pollock, 3 Punkte' : 'Jackson & Pollock, 7 Punkte';

  return `${name} · Faltensumme ${String(sum)} mm · Alter ${String(age)}`;
}

/**
 * The same, for an energy total.
 *
 * The three gram figures are on the screen, so what a coach cannot check is
 * which of them the equation used and with which factor. Naming the factors is
 * the point: it is what turns 2520 kcal from an assertion into arithmetic
 * somebody can redo.
 */
function energyInputs(nutrients: Readonly<Partial<Record<EnergyNutrientKey, number>>>): string {
  const gram = (value: number | undefined): string =>
    value === undefined ? '—' : new Intl.NumberFormat('de-DE').format(value);

  return (
    'Atwater · ' +
    `Eiweiß ${gram(nutrients.protein)} g × 4 · ` +
    `Kohlenhydrate ${gram(nutrients.carbohydrates)} g × 4 · ` +
    `Fette ${gram(nutrients.fat)} g × 9`
  );
}
