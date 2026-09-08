import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped } from '@apex/database/tenant';
import { comparisonKey, contextOf, type AthleteSex } from '@apex/domain';
import type { TenantContext } from '@apex/types';

import { BIOFEEDBACK_TREND_KEY } from '@/services/tracking/biofeedback';

/**
 * One athlete's record over time.
 *
 * ## What may be drawn beside what
 *
 * The same rule as everywhere else, from the same place: two readings belong on
 * one line only if every coordinate matches — measurement type, side, exercise,
 * stage and dimension values (`comparisonKey` in `@apex/domain`). That is why a
 * four-stage lactate test contributes **four** series and not one: stage 3 of
 * March and stage 3 of May are the same quantity, stage 1 and stage 3 are not.
 *
 * ## Why a card is keyed by catalogue key and not by id
 *
 * A measurement type id belongs to a workspace; a catalogue key is the same
 * everywhere. Keying on it is what lets body weight, body fat and the cycle be
 * offered **before** anything has been recorded — which is the whole point of a
 * documentation card, and impossible with an id that does not exist yet. It
 * also makes the address bar readable: `?card=weight`.
 *
 * ## What is left out
 *
 * Superseded readings, archived tests, and anything non-numeric. The first two
 * are the standing rules (§13); the third is not a judgement but arithmetic —
 * a movement-quality note has no position on a value axis.
 *
 * ## What is not computed
 *
 * No trend line, no average, no rate of change, no verdict. The catalogue holds
 * no reference range and the model records no direction for any quantity, so a
 * chart that said "rising is good" would be inventing one. Points and dates.
 */

type TrendDb = Pick<
  PrismaClientInstance,
  'measurement' | 'measurementType' | 'bleedingEpisode' | 'exercise' | 'trackingEntry'
>;

/** The cards that are not a measurement type. */
export const CYCLE_TREND_KEY = 'cycle';

/**
 * The nutrition week.
 *
 * A card in the same list and the same stored selection as every other, so a
 * coach adds and removes it the same way — but a **table**, not a curve, and
 * therefore rendered outside the two-column grid. What it holds is five
 * quantities at once over seven days, which no chart of one quantity can say.
 */
export const NUTRITION_TREND_KEY = 'nutrition';

/**
 * The biofeedback week.
 *
 * The second table card, and the one whose rows the coach chooses. Same shape
 * of thing as the nutrition week — several quantities across seven days, read
 * per week — so it takes the same route: a card in the ordinary list, rendered
 * outside the two-column chart grid.
 */
export { BIOFEEDBACK_TREND_KEY };

/**
 * The quantities a coach documents over time, offered whether or not anything
 * has been recorded yet.
 *
 * A body-weight card that only appeared once a body weight existed would be a
 * card nobody could use to start tracking one. These are the documented
 * exception; every other quantity is offered because it has values.
 */
const DOCUMENTATION_KEYS = ['weight', 'body_fat'] as const;

/** A card this athlete may be given, and what it would draw. */
export interface TrendOption {
  /** A measurement type's catalogue key, or one of the table cards. */
  readonly key: string;
  readonly kind: 'measurement' | 'cycle' | 'nutrition' | 'biofeedback';
  readonly name: string;
  readonly unit: string;
  /**
   * The movements this quantity was recorded with, where it was.
   *
   * Only quantities that carry one — a maximal-strength test names its lift,
   * body weight does not. Several may be chosen at once, which is what makes
   * "strength development" a comparison between lifts rather than one line.
   */
  readonly exercises: readonly { readonly id: string; readonly name: string }[];
  /** How many standing readings there are. Zero for a card offered anyway. */
  readonly count: number;
}

export interface TrendPoint {
  readonly at: Date;
  readonly value: number;
  /** Which test it came from, so a point can be traced back. `null` for a self-report. */
  readonly moduleName: string | null;
}

export interface TrendSeries {
  readonly key: string;
  /** What distinguishes this line from the others in the same chart. */
  readonly label: string;
  readonly points: readonly TrendPoint[];
  /**
   * Where the line's readings come from.
   *
   * `measured` is a diagnostic finding taken inside an examination; `tracked` is
   * a self-report or a device reading that stands alone in time. §13 is explicit
   * that the two do not carry the same evidential weight — so they share an axis,
   * because they are the same quantity in the same unit, and stay **separate
   * lines**, because a screen that drew them identically would be hiding which
   * is which.
   */
  readonly origin: 'measured' | 'tracked';
}

/** A bleeding, as it was written down. Never a computed cycle phase. */
export interface TrendEpisode {
  readonly id: string;
  readonly startedOn: Date;
  readonly endedOn: Date | null;
  readonly note: string | null;
  readonly recordedBy: 'ATHLETE' | 'COACH';
}

export interface TrendChart {
  readonly key: string;
  readonly kind: 'measurement' | 'cycle' | 'nutrition' | 'biofeedback';
  readonly title: string;
  readonly unit: string;
  readonly series: readonly TrendSeries[];
  readonly episodes: readonly TrendEpisode[];
  /** Movements this card could be narrowed to, and which it is narrowed to. */
  readonly exercises: readonly { readonly id: string; readonly name: string }[];
  readonly exerciseIds: readonly string[];
}

const measurementWhere = (athleteId: string) => ({
  // What stands (§13), from tests that are still in the working view.
  supersededById: null,
  assessmentModule: {
    archivedAt: null,
    assessment: { case: { athleteId } },
  },
});

const measurementSelect = {
  measurementTypeId: true,
  side: true,
  exerciseId: true,
  passIndex: true,
  context: true,
  numericValue: true,
  capturedAt: true,
  assessmentModule: { select: { name: true } },
  measurementType: { select: { key: true, name: true, unit: true } },
} as const;

/** A stored numeric value as a number, or `null` where there is none. */
function numberOf(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number((value as { toString: () => string }).toString());

  return Number.isFinite(parsed) ? parsed : null;
}

/** The workspace's own types plus the system catalogue it inherits (§12). */
const typeWhere = (tenant: Pick<TenantContext, 'organizationId'>, key: string) => ({
  key,
  OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
});

async function namesFor(
  db: TrendDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  exerciseIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (exerciseIds.length === 0) return new Map();

  const exercises = await db.exercise.findMany({
    where: {
      id: { in: [...exerciseIds] },
      // The catalogue rule, not an absence of scoping: a system exercise
      // carries `organizationId = null` and every workspace inherits it.
      OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
    },
    select: { id: true, name: true },
  });

  return new Map(exercises.map((exercise) => [exercise.id, exercise.name]));
}

/**
 * Which cards this athlete may be given.
 *
 * Everything they have values for, plus the ones a coach documents over time
 * whether or not anything is recorded yet. The cycle is offered for a female
 * athlete — and for anyone who already has a bleeding documented, so nothing
 * already written down can become unreachable.
 */
export async function athleteTrendOptions(
  db: TrendDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athlete: { readonly id: string; readonly sex: AthleteSex },
): Promise<readonly TrendOption[]> {
  /**
   * What was measured, and what the athlete reported — in one wave.
   *
   * The self-reports are a different table answering a different question, so
   * they never needed the measurements first. Reading them afterwards put a
   * round trip in the middle of a list that a coach sees on every profile.
   */
  const [rows, tracked] = await Promise.all([
    db.measurement.findMany({
      where: scoped(tenant, measurementWhere(athlete.id)),
      select: measurementSelect,
    }),
    /**
     * A quantity that only exists as self-reports still has a curve worth
     * offering — otherwise a coach who asked an athlete to weigh themselves
     * would find no card for the answers.
     */
    db.trackingEntry.groupBy({
      by: ['measurementTypeId'],
      where: scoped(tenant, { athleteId: athlete.id }),
      _count: { _all: true },
    }),
  ]);

  const numeric = rows.filter((row) => numberOf(row.numericValue) !== null);
  const exerciseNames = await namesFor(
    db,
    tenant,
    [...new Set(numeric.map((row) => row.exerciseId))].filter((id): id is string => id !== null),
  );

  const byKey = new Map<
    string,
    { name: string; unit: string; count: number; exerciseIds: Set<string> }
  >();

  for (const row of numeric) {
    const key = row.measurementType.key;
    const found = byKey.get(key);

    if (found) {
      found.count += 1;
      if (row.exerciseId !== null) found.exerciseIds.add(row.exerciseId);
      continue;
    }

    byKey.set(key, {
      name: row.measurementType.name,
      unit: row.measurementType.unit,
      count: 1,
      exerciseIds: new Set(row.exerciseId === null ? [] : [row.exerciseId]),
    });
  }

  if (tracked.length > 0) {
    const types = await db.measurementType.findMany({
      where: { id: { in: tracked.map((entry) => entry.measurementTypeId) } },
      select: { id: true, key: true, name: true, unit: true },
    });
    const byId = new Map(types.map((type) => [type.id, type]));

    for (const entry of tracked) {
      const type = byId.get(entry.measurementTypeId);
      if (!type) continue;

      const found = byKey.get(type.key);

      if (found) found.count += entry._count._all;
      else {
        byKey.set(type.key, {
          name: type.name,
          unit: type.unit,
          count: entry._count._all,
          exerciseIds: new Set(),
        });
      }
    }
  }

  /**
   * Everything else this function needs, asked for at once.
   *
   * It used to be five awaits in a row — a `findFirst` per documentation key, a
   * bleeding count, and a `count` for each of the two table cards — each one
   * waiting for the last. They depend on nothing but the tenant, so the only
   * thing the sequence bought was latency: five round trips to Supabase before
   * the first option could be built.
   *
   * The documentation keys are one `findMany` rather than one query per key,
   * for the same reason.
   */
  const missing = DOCUMENTATION_KEYS.filter((key) => !byKey.has(key));

  const [documentation, bleedings, tableTypes] = await Promise.all([
    missing.length === 0
      ? Promise.resolve([])
      : db.measurementType.findMany({
          where: {
            key: { in: [...missing] },
            archivedAt: null,
            OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
          },
          select: { key: true, name: true, unit: true, organizationId: true },
        }),
    db.bleedingEpisode.count({ where: scoped(tenant, { athleteId: athlete.id }) }),
    // Which table cards the catalogue can hold at all — one grouped read
    // instead of a `count` per card.
    db.measurementType.groupBy({
      by: ['category'],
      where: {
        category: { in: ['nutrition', 'biofeedback'] },
        archivedAt: null,
        OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
      },
      _count: { _all: true },
    }),
  ]);

  // The documentation cards, added where they are not already there. A
  // workspace whose catalogue has not been seeded cannot offer one, and
  // inventing a name for a type that does not exist would be worse.
  for (const key of DOCUMENTATION_KEYS) {
    if (byKey.has(key)) continue;

    const found = documentation
      .filter((type) => type.key === key)
      // The workspace's own definition wins over the system one.
      .sort(
        (left, right) =>
          (left.organizationId === null ? 1 : 0) - (right.organizationId === null ? 1 : 0),
      )[0];

    if (!found) continue;

    byKey.set(key, { name: found.name, unit: found.unit, count: 0, exerciseIds: new Set() });
  }

  const options: TrendOption[] = [...byKey.entries()].map(([key, entry]) => ({
    key,
    kind: 'measurement' as const,
    name: entry.name,
    unit: entry.unit,
    exercises: [...entry.exerciseIds].flatMap((id) => {
      const name = exerciseNames.get(id);

      return name === undefined ? [] : [{ id, name }];
    }),
    count: entry.count,
  }));

  options.sort((left, right) => left.name.localeCompare(right.name, 'de'));

  const offersCycle = athlete.sex === 'female' || bleedings > 0;
  const held = (category: string): number =>
    tableTypes.find((row) => row.category === category)?._count._all ?? 0;

  /**
   * The nutrition week is offered before anything has been eaten, but not
   * before the catalogue can hold it.
   *
   * The first half is the documentation-card reasoning: a table that only
   * appeared once something had been written down would be a table nobody could
   * use to start writing one. The second half is the rule one line above — a
   * workspace whose catalogue was never seeded has no nutrition types, and a
   * card offered there would open onto columns that cannot be written to.
   *
   * `count: 0` because the figure beside an option counts readings of one
   * quantity, and this card holds five; a number there would answer a different
   * question than the one it is placed under.
   */
  const nutrition: readonly TrendOption[] =
    held('nutrition') === 0
      ? []
      : [
          {
            key: NUTRITION_TREND_KEY,
            kind: 'nutrition' as const,
            name: 'Ernährung',
            unit: '',
            exercises: [],
            count: 0,
          },
        ];

  // The biofeedback table, on the same two conditions: offered before anything
  // has been written down, and not before the catalogue can hold it.
  const biofeedback: readonly TrendOption[] =
    held('biofeedback') === 0
      ? []
      : [
          {
            key: BIOFEEDBACK_TREND_KEY,
            kind: 'biofeedback' as const,
            name: 'Biofeedback',
            unit: '',
            exercises: [],
            count: 0,
          },
        ];

  return offersCycle
    ? [
        {
          key: CYCLE_TREND_KEY,
          kind: 'cycle' as const,
          name: 'Zyklus',
          unit: '',
          exercises: [],
          count: bleedings,
        },
        ...biofeedback,
        ...nutrition,
        ...options,
      ]
    : [...biofeedback, ...nutrition, ...options];
}

/** What one card was asked to show. */
export interface TrendSelection {
  readonly key: string;
  /** Empty means every movement this quantity was recorded with. */
  readonly exerciseIds: readonly string[];
}

/**
 * The card behind one selection.
 *
 * A card with nothing recorded is **not** `null`: it is a card saying so, which
 * is what lets a coach add "body weight" before there is a body weight. `null`
 * is reserved for a key that is not a card at all.
 */
export async function athleteTrend(
  db: TrendDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athlete: { readonly id: string; readonly sex: AthleteSex },
  selection: TrendSelection,
): Promise<TrendChart | null> {
  if (selection.key === '') return null;

  /**
   * The cycle card carries no series and, since it became a calendar, no
   * episodes either.
   *
   * It used to read every documented bleeding here so the card could list them.
   * The month view replaced that list and loads its own month, so the read was
   * left doing work nothing displayed — on a record with years of entries, all
   * of them, on every render of the profile.
   */
  if (selection.key === CYCLE_TREND_KEY) {
    return {
      key: CYCLE_TREND_KEY,
      kind: 'cycle',
      title: 'Zyklus',
      unit: '',
      series: [],
      episodes: [],
      exercises: [],
      exerciseIds: [],
    };
  }

  /**
   * The nutrition card carries no series.
   *
   * Its data is a week, it is loaded per week, and the week is not part of a
   * selection that says nothing about time. So this returns the card's identity
   * and nothing else; the table beside it does the reading.
   */
  if (selection.key === NUTRITION_TREND_KEY) {
    return {
      key: NUTRITION_TREND_KEY,
      kind: 'nutrition',
      title: 'Ernährung',
      unit: '',
      series: [],
      episodes: [],
      exercises: [],
      exerciseIds: [],
    };
  }

  if (selection.key === BIOFEEDBACK_TREND_KEY) {
    return {
      key: BIOFEEDBACK_TREND_KEY,
      kind: 'biofeedback',
      title: 'Biofeedback',
      unit: '',
      series: [],
      episodes: [],
      exercises: [],
      exerciseIds: [],
    };
  }

  /**
   * Everything this card can be drawn from, in one wave.
   *
   * Four reads, and only the last of them needed anything from the others: the
   * name and unit come from the quantity's own row, the values are found by the
   * quantity's **key** rather than by its id, the wider movement list asks the
   * same question without the narrowing, and the athlete's own entries are a
   * separate table entirely. Each one used to wait out the one before it, which
   * on a profile with three cards meant three cards' worth of round trips
   * stacked four deep.
   *
   * A card for a quantity this workspace does not have still answers `null`
   * below — it then paid for three reads it did not use, which happens only for
   * a stored card whose quantity has since gone.
   */
  const [type, rows, widerRows, tracked] = await Promise.all([
    db.measurementType.findFirst({
      where: typeWhere(tenant, selection.key),
      select: { name: true, unit: true },
    }),
    db.measurement.findMany({
      where: scoped(tenant, {
        ...measurementWhere(athlete.id),
        measurementType: { key: selection.key },
        ...(selection.exerciseIds.length === 0
          ? {}
          : { exerciseId: { in: [...selection.exerciseIds] } }),
      }),
      select: measurementSelect,
      orderBy: [{ capturedAt: 'asc' }],
    }),
    // Every movement this quantity was recorded with, not only the chosen ones
    // — otherwise narrowing to one lift would hide the way back to the others.
    // Only needed where the card *is* narrowed; otherwise the rows above
    // already carry every movement.
    selection.exerciseIds.length === 0
      ? []
      : db.measurement.findMany({
          where: scoped(tenant, {
            ...measurementWhere(athlete.id),
            measurementType: { key: selection.key },
          }),
          select: { exerciseId: true, numericValue: true },
        }),
    /**
     * What the athlete or their device contributed.
     *
     * Left out entirely when the card is narrowed to particular movements,
     * because a self-reported body weight belongs to no lift and showing it
     * under one would be a claim nobody made.
     */
    selection.exerciseIds.length === 0
      ? db.trackingEntry.findMany({
          where: scoped(tenant, {
            athleteId: athlete.id,
            measurementType: { key: selection.key },
          }),
          select: { capturedAt: true, numericValue: true },
          orderBy: [{ capturedAt: 'asc' }],
        })
      : [],
  ]);

  if (!type) return null;

  const numeric = rows.filter((row) => numberOf(row.numericValue) !== null);

  const everyMovement =
    selection.exerciseIds.length === 0
      ? numeric.map((row) => row.exerciseId)
      : widerRows.filter((row) => numberOf(row.numericValue) !== null).map((row) => row.exerciseId);

  const exerciseNames = await namesFor(
    db,
    tenant,
    [...new Set(everyMovement)].filter((id): id is string => id !== null),
  );

  // One line per set of coordinates, by the one comparison rule. A stepped test
  // therefore contributes one line per stage.
  const grouped = new Map<string, TrendPoint[]>();
  const described = new Map<string, string>();

  for (const row of numeric) {
    const key = comparisonKey(row);
    const points = grouped.get(key) ?? [];

    points.push({
      at: row.capturedAt,
      value: numberOf(row.numericValue) ?? 0,
      moduleName: row.assessmentModule.name,
    });
    grouped.set(key, points);

    if (!described.has(key)) described.set(key, seriesLabel(row, exerciseNames));
  }

  // One line, never split by coordinates: a tracking entry has no side, no
  // exercise and no stage — it is a quantity at a moment.
  const trackedPoints: TrendPoint[] = tracked.flatMap((row) => {
    const value = numberOf(row.numericValue);

    return value === null ? [] : [{ at: row.capturedAt, value, moduleName: null }];
  });

  return {
    key: selection.key,
    kind: 'measurement',
    title: type.name,
    unit: type.unit,
    series: [
      ...[...grouped.entries()].map((entry) => ({
        key: entry[0],
        label: described.get(entry[0]) ?? '',
        points: [...entry[1]].sort((left, right) => left.at.getTime() - right.at.getTime()),
        origin: 'measured' as const,
      })),
      ...(trackedPoints.length === 0
        ? []
        : [
            {
              key: 'tracked',
              label: 'Selbst erfasst',
              points: trackedPoints,
              origin: 'tracked' as const,
            },
          ]),
    ],
    episodes: [],
    exercises: [...exerciseNames.entries()].map(([id, name]) => ({ id, name })),
    exerciseIds: [...selection.exerciseIds],
  };
}

/**
 * What tells one line apart from another in the same chart.
 *
 * Only what is there: the movement, the side where the test records one, the
 * stage where there are stages, and the dimension values.
 */
function seriesLabel(
  row: {
    side: string;
    exerciseId: string | null;
    passIndex: number | null;
    context: unknown;
  },
  exerciseNames: ReadonlyMap<string, string>,
): string {
  const parts: string[] = [];

  if (row.exerciseId !== null) parts.push(exerciseNames.get(row.exerciseId) ?? 'Übung');
  if (row.side !== 'BILATERAL') parts.push(row.side === 'LEFT' ? 'Links' : 'Rechts');
  if (row.passIndex !== null) parts.push(`Stufe ${String(row.passIndex)}`);

  for (const value of Object.values(contextOf(row.context))) parts.push(value);

  return parts.length === 0 ? 'Verlauf' : parts.join(' · ');
}
