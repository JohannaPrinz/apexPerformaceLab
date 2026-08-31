import {
  hasTempo,
  isJointDimension,
  movementProfile,
  isPositionDimension,
  setTempo,
  SIDE_LABELS_DE,
  epleyOneRepMax,
  strengthStanding,
  type AthleteSex,
  type SetTempo,
  type StrengthStanding,
  type Tendency,
} from '@apex/domain';

import type { ChartGroupView } from '@/components/common/measurement-chart';

/**
 * One shape for the analysis, whichever side of the link it is read from.
 *
 * ## Why the coach and the athlete see the same document
 *
 * They were two components, and they drifted: the same measurement was a table
 * row on one screen and a differently ordered table row on the other, and a
 * change to either was a change to one of them. Worse, a coach could not tell
 * what they were about to send by looking at what they were editing.
 *
 * So there is one document. The coach's screen renders it with two things added
 * — which tests it draws on, and the fields for their own words — and sending it
 * takes nothing away. What the coach reads is what the athlete reads.
 *
 * ## Why this file is pure
 *
 * Both mappers feed it: one from the live evaluation, one from the frozen
 * snapshot. Keeping the shape and its formatting here is what makes "the same
 * document" a fact rather than an intention, and it is testable without a
 * database, a bucket or a browser.
 */

/** A target the test set for an angle, and whether the reading met it. */
/** Which joint, which side, at which point of the movement. */
export interface DocumentAxes {
  readonly track: string | null;
  readonly side: string | null;
  readonly position: string | null;
}

export interface DocumentTarget {
  readonly comparison: 'at_most' | 'at_least' | 'equals';
  readonly degrees: number;
  readonly met: boolean;
}

/** One measured quantity of one test. */
export interface DocumentRow {
  readonly key: string;
  readonly typeName: string;
  readonly measurementTypeKey: string;
  readonly unit: string;
  /** Side, exercise, stage and context, already joined into a readable line. */
  readonly coordinates: string;
  /** The exercise's catalogue key, where the reading names one. Rules match on it. */
  readonly exerciseKey: string;
  /**
   * The same coordinates, still apart.
   *
   * A joined line reads well and pivots badly. The angle table is a grid of
   * joint × side with one column per position, and splitting that line back
   * apart on a separator would guess at wording the coach may well have chosen
   * themselves. Filled where the axes exist and `null` where they do not.
   */
  readonly axes: DocumentAxes;
  readonly value: number;
  readonly capturedAt: Date;
  readonly previous: number | null;
  readonly difference: number | null;
  readonly tendency: Tendency | null;
  readonly best: { value: number; capturedAt: Date } | null;
  readonly count: number;
  readonly target: DocumentTarget | null;
  readonly percentile: { readonly percentile: number; readonly cohort: number } | null;
  readonly source: string;
}

/** One still, ready to render. */
export interface DocumentImage {
  readonly id: string;
  readonly url: string;
  readonly label: string;
}

/**
 * What a video analysis saw, ready to draw.
 *
 * Tempo is derived here rather than carried: it follows from the curve by
 * arithmetic, so both sides of the link recompute the same answer from the same
 * curve and there is no second copy to keep in step.
 */
export interface DocumentMovement {
  /** Which profile drew this. Decides the order of the angle grid's columns. */
  readonly profileKey: string;
  readonly profileName: string;
  readonly repetitions: number;
  readonly durationMs: number;
  readonly signal: readonly { timestampMs: number; primary: number | null }[];
  readonly reps: readonly {
    index: number;
    startedAtMs: number;
    endedAtMs: number;
    durationMs: number;
  }[];
  readonly tempo: SetTempo | null;
}

export interface DocumentTest {
  readonly moduleId: string;
  readonly name: string;
  readonly typeLabel: string;
  /** When it was carried out, and how far it got. Shown in the tile's head. */
  readonly performedAt: Date;
  readonly statusLabel: string;
  readonly protocolLabel: string | null;
  readonly derivations: readonly string[];
  readonly rows: readonly DocumentRow[];
  readonly images: readonly DocumentImage[];
  readonly movement: DocumentMovement | null;
  /** Staged tests as curves. Empty where the test records one value per series. */
  readonly charts: readonly ChartGroupView[];
  readonly interpretation: string;
  readonly recommendation: string;
}

/**
 * What a body-composition reading needs beside itself.
 *
 * Height and date of birth are properties of the person, not of a test, so they
 * sit on the document rather than in a test's rows. Both are frequently absent —
 * neither is required of an athlete — and everything derived from them is
 * omitted rather than guessed when they are.
 */
export interface DocumentAthlete {
  readonly heightCm: number | null;
  readonly dateOfBirth: Date | null;
  /** What the strength standards are read against. Both frequently absent. */
  readonly weightKg: number | null;
  readonly sex: AthleteSex | null;
}

export interface DocumentView {
  readonly athleteName: string;
  readonly athlete: DocumentAthlete;
  readonly performedAt: Date;
  readonly coachName: string;
  readonly tests: readonly DocumentTest[];
  readonly overall: { readonly interpretation: string; readonly recommendation: string };
}

const NUMBER = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export const DATE_LONG = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export const DATE_SHORT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});

/**
 * A value as a person reads it.
 *
 * Durations become a clock. The catalogue stores one unit that arithmetic works
 * on — seconds — and says in as many words that how it is *shown* is the
 * interface's business. A kilometre in 238 s is a number; 3:58 is a running
 * time, and an athlete recognises the second one.
 *
 * Below a minute it stays in seconds, because "0:42" reads like a lap and "42 s"
 * reads like a hold.
 */
export function formatValue(value: number, unit: string, measurementTypeKey: string): string {
  if (measurementTypeKey === 'duration' && Number.isFinite(value) && value >= 60) {
    const total = Math.round(value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;

    return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
  }

  return unit.trim() === '' ? NUMBER.format(value) : `${NUMBER.format(value)} ${unit}`;
}

/** A difference, always signed, always in the measurement's own unit. */
export function formatDifference(difference: number, unit: string): string {
  if (difference === 0) return '±0';

  const sign = difference > 0 ? '+' : '−';
  const size = NUMBER.format(Math.abs(difference));

  return unit.trim() === '' ? `${sign}${size}` : `${sign}${size} ${unit}`;
}

/**
 * The axes of one reading, read by key rather than by position in a string.
 *
 * The values are already the coach's words — the service translates the
 * profile's own keys before they get here — so this only has to find them. A
 * test that declares neither axis yields nulls, and the pivot then leaves it
 * out rather than inventing a row for it.
 */
export function axesOf(row: {
  readonly side: string;
  readonly context: Record<string, string>;
}): DocumentAxes {
  let track: string | null = null;
  let position: string | null = null;

  for (const [axis, value] of Object.entries(row.context)) {
    if (value === '') continue;
    if (isJointDimension(axis)) track ??= value;
    else if (isPositionDimension(axis)) position ??= value;
  }

  return {
    track,
    side: row.side === 'BILATERAL' ? null : (SIDE_LABELS_DE[row.side] ?? row.side),
    position,
  };
}

/** A frozen sex, where it is one the domain recognises. */
function readSex(value: string | null): AthleteSex | null {
  return value === 'male' || value === 'female' || value === 'not_specified' ? value : null;
}

/** The coordinates of one series, in the order the entry grid names them. */
export function coordinatesOf(row: {
  readonly side: string;
  readonly exerciseName: string | null;
  readonly passIndex: number | null;
  readonly context: Record<string, string>;
}): string {
  return [
    row.exerciseName,
    row.side === 'BILATERAL' ? null : (SIDE_LABELS_DE[row.side] ?? row.side),
    row.passIndex === null ? null : `Stufe ${String(row.passIndex)}`,
    ...Object.values(row.context),
  ]
    .filter((part) => part !== null && part !== '')
    .join(' · ');
}

/** How a target reads beside the number. */
export const TARGET_SYMBOLS: Readonly<Record<DocumentTarget['comparison'], string>> = {
  at_most: '≤',
  at_least: '≥',
  equals: '=',
};

export function formatTarget(target: DocumentTarget): string {
  return `${TARGET_SYMBOLS[target.comparison]} ${NUMBER.format(target.degrees)}°`;
}

/**
 * The rows worth putting in the overview diagram.
 *
 * Only changes that may be spoken about: a row with no earlier reading has no
 * change, and a row whose test declared no direction has a change nobody may
 * call good or bad. Both are still in the tiles and in the table — they are just
 * not in a picture whose whole grammar is "this way is the aim".
 */
export function overviewRows(
  tests: readonly DocumentTest[],
): readonly { test: DocumentTest; row: DocumentRow }[] {
  return tests.flatMap((test) =>
    test.rows
      .filter((row) => row.difference !== null && row.tendency !== null)
      .map((row) => ({ test, row })),
  );
}

/** Whether the document has anything to draw a diagram from at all. */
export function hasOverview(tests: readonly DocumentTest[]): boolean {
  return overviewRows(tests).length > 0;
}

/**
 * Where a still's bytes come from.
 *
 * A route rather than a public URL: the object store holds nothing that may be
 * read by whoever guesses a key, and the same route serves the coach (by
 * session) and the athlete (by the share cookie).
 */
export function mediaUrl(key: string): string {
  return `/api/report-media/${key}`;
}

/** What both mappers need of a series, whichever side it came from. */
interface SeriesLike {
  readonly key: string;
  readonly typeName: string;
  readonly measurementTypeKey: string;
  readonly unit: string;
  readonly side: string;
  readonly exerciseName: string | null;
  readonly exerciseKey?: string | undefined;
  readonly passIndex: number | null;
  readonly context: Record<string, string>;
  readonly source: string;
  readonly difference: number | null;
  readonly tendency?: Tendency | null;
  readonly betterDirection?: 'lower' | 'higher' | null;
  readonly target: DocumentTarget | null;
  readonly percentile?: { readonly percentile: number; readonly cohort: number } | null;
  readonly count?: number;
}

function rowOf(
  series: SeriesLike,
  current: { value: number; capturedAt: Date },
  previous: { value: number } | null,
  best: { value: number; capturedAt: Date } | null,
  tendency: Tendency | null,
): DocumentRow {
  return {
    key: series.key,
    typeName: series.typeName,
    measurementTypeKey: series.measurementTypeKey,
    unit: series.unit,
    coordinates: coordinatesOf(series),
    exerciseKey: series.exerciseKey ?? '',
    axes: axesOf(series),
    value: current.value,
    capturedAt: current.capturedAt,
    previous: previous?.value ?? null,
    difference: series.difference,
    tendency,
    best,
    count: series.count ?? 1,
    target: series.target,
    percentile: series.percentile ?? null,
    source: series.source,
  };
}

/** The live analysis, as the document the coach is about to send. */
export function documentFromEvaluation(evaluation: {
  readonly athlete: {
    readonly firstName: string;
    readonly lastName: string;
    readonly heightCm: number | null;
    readonly dateOfBirth: Date | null;
    readonly weightKg: number | null;
    readonly sex: AthleteSex | null;
  };
  readonly assessment: { readonly performedAt: Date };
  readonly coachName: string;
  readonly overall: { readonly interpretation: string; readonly recommendation: string };
  readonly modules: readonly {
    readonly moduleId: string;
    readonly name: string;
    readonly typeLabel: string;
    readonly statusLabel: string;
    readonly protocolLabel: string | null;
    readonly derivations: readonly string[];
    readonly included: boolean;
    readonly images: readonly { id: string; key: string; label: string }[];
    readonly movement: DocumentMovement | null;
    readonly charts: readonly ChartGroupView[];
    readonly interpretation: string;
    readonly recommendation: string;
    readonly series: readonly (SeriesLike & {
      readonly current: { value: number; capturedAt: Date };
      readonly previous: { value: number; capturedAt: Date } | null;
      readonly best: { value: number; capturedAt: Date } | null;
    })[];
  }[];
}): DocumentView {
  return {
    athleteName: `${evaluation.athlete.firstName} ${evaluation.athlete.lastName}`.trim(),
    athlete: {
      heightCm: evaluation.athlete.heightCm,
      dateOfBirth: evaluation.athlete.dateOfBirth,
      weightKg: evaluation.athlete.weightKg,
      sex: evaluation.athlete.sex,
    },
    performedAt: evaluation.assessment.performedAt,
    coachName: evaluation.coachName,
    overall: evaluation.overall,
    tests: evaluation.modules
      .filter((entry) => entry.included)
      .map((entry) => ({
        moduleId: entry.moduleId,
        name: entry.name,
        typeLabel: entry.typeLabel,
        performedAt: evaluation.assessment.performedAt,
        statusLabel: entry.statusLabel,
        protocolLabel: entry.protocolLabel,
        derivations: entry.derivations,
        rows: withoutAggregates(
          entry.series.map((series) =>
            rowOf(series, series.current, series.previous, series.best, series.tendency ?? null),
          ),
          entry.movement !== null,
        ),
        images: entry.images.map((image) => ({
          id: image.id,
          url: mediaUrl(image.key),
          label: image.label,
        })),
        movement: entry.movement,
        charts: entry.charts,
        interpretation: entry.interpretation,
        recommendation: entry.recommendation,
      })),
  };
}

/**
 * The frozen analysis, as the same document.
 *
 * The tendency is recomputed from the direction the snapshot froze, not looked
 * up: the direction travelled with the document precisely so this stays true
 * years later, and running the same domain rule over it is what makes the two
 * renderings agree by construction rather than by inspection.
 */
export function documentFromSnapshot(
  snapshot: {
    readonly publishedAt: string;
    readonly assessment: { readonly performedAt: string };
    readonly athlete: {
      readonly firstName: string;
      readonly lastName: string;
      /** Absent in every document frozen before these travelled with one. */
      readonly heightCm?: number | null;
      readonly dateOfBirth?: string | null;
      readonly weightKg?: number | null;
      readonly sex?: string | null;
    };
    readonly coach: { readonly name: string };
    readonly overall: { readonly interpretation: string; readonly recommendation: string };
    readonly modules: readonly {
      readonly moduleId: string;
      readonly name: string;
      readonly typeLabel: string;
      readonly performedAt?: string;
      readonly statusLabel?: string;
      readonly protocolLabel: string | null;
      readonly derivations: readonly string[];
      readonly interpretation: string;
      readonly recommendation: string;
      readonly media: readonly { id: string; key: string; label: string }[];
      readonly movement: {
        readonly profileKey?: string;
        readonly profileName: string;
        readonly repetitions: number;
        readonly durationMs: number;
        readonly reps: readonly {
          index: number;
          startedAtMs: number;
          endedAtMs: number;
          durationMs: number;
        }[];
        readonly signal: readonly { timestampMs: number; primary: number | null }[];
      } | null;
      readonly charts?: readonly ChartGroupView[];
      readonly series: readonly (SeriesLike & {
        readonly current: { value: number; capturedAt: string };
        readonly previous: { value: number; capturedAt: string } | null;
        readonly best: { value: number; capturedAt: string } | null;
      })[];
    }[];
  },
  tendency: (difference: number | null, direction: 'lower' | 'higher' | null) => Tendency | null,
  /**
   * How this reader reaches the pictures.
   *
   * Passed in because the two readers prove themselves differently: a coach by
   * their session, an athlete by a cookie scoped to their own link. The document
   * is the same; only the door differs.
   */
  urlOf: (key: string) => string = mediaUrl,
): DocumentView {
  return {
    athleteName: `${snapshot.athlete.firstName} ${snapshot.athlete.lastName}`.trim(),
    athlete: {
      heightCm: snapshot.athlete.heightCm ?? null,
      dateOfBirth:
        snapshot.athlete.dateOfBirth === undefined || snapshot.athlete.dateOfBirth === null
          ? null
          : new Date(snapshot.athlete.dateOfBirth),
      weightKg: snapshot.athlete.weightKg ?? null,
      // Stored as a plain string so an unknown value cannot break a document
      // that is years old; read back only where it is one the table knows.
      sex: readSex(snapshot.athlete.sex ?? null),
    },
    performedAt: new Date(snapshot.assessment.performedAt),
    coachName: snapshot.coach.name,
    overall: snapshot.overall,
    tests: snapshot.modules.map((entry) => ({
      moduleId: entry.moduleId,
      name: entry.name,
      typeLabel: entry.typeLabel,
      performedAt:
        entry.performedAt === undefined || entry.performedAt === ''
          ? new Date(snapshot.assessment.performedAt)
          : new Date(entry.performedAt),
      statusLabel: entry.statusLabel ?? '',
      protocolLabel: entry.protocolLabel,
      derivations: entry.derivations,
      rows: withoutAggregates(
        entry.series.map((series) =>
          rowOf(
            series,
            { value: series.current.value, capturedAt: new Date(series.current.capturedAt) },
            series.previous,
            series.best === null
              ? null
              : { value: series.best.value, capturedAt: new Date(series.best.capturedAt) },
            tendency(series.difference, series.betterDirection ?? null),
          ),
        ),
        entry.movement !== null,
      ),
      images: entry.media.map((media) => ({
        id: media.id,
        url: urlOf(media.key),
        label: media.label,
      })),
      movement: movementFromSnapshot(entry.movement),
      // Tolerant of a document frozen before curves travelled with it: the
      // schema defaults it on read, and an older payload honestly had none.
      charts: entry.charts ?? [],
      interpretation: entry.interpretation,
      recommendation: entry.recommendation,
    })),
  };
}

/**
 * The frozen curve, with its tempo worked out again.
 *
 * Recomputing rather than freezing the numbers is what makes the athlete's copy
 * and the coach's agree by construction: the same function over the same curve.
 */
function movementFromSnapshot(
  movement: {
    /** Absent in every document frozen before the key travelled with one. */
    readonly profileKey?: string;
    readonly profileName: string;
    readonly repetitions: number;
    readonly durationMs: number;
    readonly reps: readonly {
      index: number;
      startedAtMs: number;
      endedAtMs: number;
      durationMs: number;
    }[];
    readonly signal: readonly { timestampMs: number; primary: number | null }[];
  } | null,
): DocumentMovement | null {
  if (movement === null) return null;

  const tempo = setTempo(movement.signal, movement.reps);

  return {
    ...movement,
    profileKey: movement.profileKey ?? '',
    tempo: hasTempo(tempo) ? tempo : null,
  };
}

/** The angles a video analysis measured, in the order the profile names them. */
export function anglesOf(test: DocumentTest): readonly DocumentRow[] {
  return test.rows.filter((row) => row.measurementTypeKey === 'joint_angle');
}

/** One measured angle in the grid, with the target it was judged against. */
export interface AngleCell {
  readonly degrees: number;
  readonly target: DocumentTarget | null;
}

/** One joint on one side, across every position the analysis reached. */
export interface AngleRow {
  readonly key: string;
  readonly track: string;
  readonly side: string | null;
  readonly cells: ReadonlyMap<string, AngleCell>;
}

/**
 * The angles as the analysis screen lays them out: joint and side down, the
 * positions across.
 *
 * ## Why a grid and not a list
 *
 * A flat list of twelve readings makes a coach compare "Knie links gebeugt"
 * with "Knie rechts gebeugt" by reading two rows four apart. Side by side, left
 * against right is one glance — and left against right is the comparison a
 * video analysis exists for.
 *
 * ## Why the columns come from the readings
 *
 * The positions are whatever this run actually reached, in the order they first
 * appear, rather than everything the profile defines. A column headed
 * "gestreckt" with nothing under it would claim the analysis looked and found
 * nothing, when it never looked.
 *
 * Readings that name no joint are left out entirely: they have no cell in a grid
 * of joints, and the full table below the document still carries them.
 */
export function angleTableOf(test: DocumentTest): {
  readonly positions: readonly string[];
  readonly rows: readonly AngleRow[];
} {
  const positions: string[] = [];
  // The profile's own order where it is known — "gestreckt" then "gebeugt", as
  // the analysis screen writes them. Where it is not, the order the readings
  // arrive in, which is at least the order they were measured.
  const declared = (movementProfile(test.movement?.profileKey)?.positions ?? []).map(
    (position) => position.label,
  );
  const rows = new Map<
    string,
    { track: string; side: string | null; cells: Map<string, AngleCell> }
  >();

  for (const row of anglesOf(test)) {
    const { track, side, position } = row.axes;
    if (track === null || position === null) continue;

    if (!positions.includes(position)) positions.push(position);

    const key = `${track}\u0000${side ?? ''}`;
    const found = rows.get(key) ?? { track, side, cells: new Map<string, AngleCell>() };

    // The first reading of a position wins: the analysis writes one median per
    // joint, side and position, and a second row for the same three is a
    // correction that already superseded the first before it got here.
    if (!found.cells.has(position)) {
      found.cells.set(position, { degrees: row.value, target: row.target });
    }

    rows.set(key, found);
  }

  /**
   * Grouped by joint, left before right.
   *
   * The readings do not arrive in a fixed order — a frozen document replays
   * whatever order its series were written in, which put "Sprunggelenk rechts"
   * above "Hüfte links" above "Sprunggelenk links". Whichever joint comes first
   * keeps its place; what matters is that its two sides sit together, because
   * left against right is the comparison being made.
   */
  const trackOrder = [...new Set([...rows.values()].map((row) => row.track))];
  const sideOrder = ['links', 'rechts'];
  // Case-insensitively: the label arrives capitalised from the catalogue and is
  // written lower case in the cell, and the order must not depend on which.
  const rank = (side: string | null) => {
    const at = side === null ? -1 : sideOrder.indexOf(side.toLowerCase());

    return at === -1 ? sideOrder.length : at;
  };

  const columns = [...positions].sort((a, b) => {
    const left = declared.indexOf(a);
    const right = declared.indexOf(b);
    if (left === right) return positions.indexOf(a) - positions.indexOf(b);

    return (left === -1 ? declared.length : left) - (right === -1 ? declared.length : right);
  });

  return {
    positions: columns,
    rows: [...rows.entries()]
      .map(([key, row]) => ({ key, track: row.track, side: row.side, cells: row.cells }))
      .sort(
        (a, b) =>
          trackOrder.indexOf(a.track) - trackOrder.indexOf(b.track) || rank(a.side) - rank(b.side),
      ),
  };
}

/**
 * Rows a video analysis should not restate.
 *
 * A range of motion is the difference between two angles this analysis already
 * reports — showing it beside them is the same fact twice, and it is the number
 * a coach can least act on: 95° reached from 130° and 95° reached from 175° are
 * different movements, and only the angles say which happened.
 */
const ANALYSIS_AGGREGATES = new Set(['range_of_motion']);

function withoutAggregates(
  rows: readonly DocumentRow[],
  hasMovement: boolean,
): readonly DocumentRow[] {
  return hasMovement
    ? rows.filter((row) => !ANALYSIS_AGGREGATES.has(row.measurementTypeKey))
    : rows;
}

/**
 * Whether this test is read as a curve rather than as numbers.
 *
 * A staged test — a lactate step test, an incremental run — records the whole
 * set once per stage. Its readings are points on a line, and listing them as
 * eighteen headline values is the same mistake as reading a lactate curve out
 * loud: every number is there and none of them is the answer.
 */
export function isStaged(test: DocumentTest): boolean {
  return test.charts.some((group) => group.series.some((line) => line.points.length > 1));
}

/**
 * The readings a tile puts at the top.
 *
 * Where a video analysis exists, its angles are not headlines — there are eight
 * of them and they belong in the table beside the curve they came from. What is
 * left is what the test says about itself: how many repetitions, how far the
 * joint travelled.
 *
 * A staged test has no headline readings at all: the curve is the reading, and
 * the complete numbers are in the table at the foot of the document.
 */
const EXTERNAL_LOAD_KEY = 'external_load';
const REPETITIONS_KEY = 'repetitions';

/** One lift of a maximal strength test, with its estimate and its standing. */
export interface StrengthLift {
  readonly key: string;
  /** What was lifted, as the coach reads it: exercise, side, stage. */
  readonly label: string;
  readonly loadKg: number;
  readonly repetitions: number | null;
  /** Epley's estimate, or `null` where the set is outside its range. */
  readonly oneRepMaxKg: number | null;
  readonly standing: StrengthStanding | null;
}

/**
 * A maximal strength test, read the way a coach reads it.
 *
 * ## Why the estimate and not the load alone
 *
 * "132,5 kg × 5" and "150 kg × 1" are the same athlete on two days, and neither
 * number compares with the other until both are expressed as the same thing.
 * Epley's estimate is that thing, it is named wherever it appears, and a set too
 * long for the formula gets no estimate rather than a bad one.
 *
 * ## Why the standing sits above the table
 *
 * A multiple of body weight is what the coach's own orientation table is stated
 * in, and it is the sentence they act on. The kilos underneath are what it was
 * worked out from — visible, in a table, so the reading can be checked.
 *
 * Returns `null` for every test that records no load; the ordinary tile is
 * right for those.
 */
export function strengthView(
  test: DocumentTest,
  athlete: DocumentAthlete,
): { readonly lifts: readonly StrengthLift[] } | null {
  const loads = test.rows.filter((row) => row.measurementTypeKey === EXTERNAL_LOAD_KEY);
  if (loads.length === 0) return null;

  const lifts = loads.map((row): StrengthLift => {
    /**
     * The repetitions recorded *with this load*.
     *
     * Matched on the coordinates rather than taken as "the test's repetitions":
     * one test may hold a bench press and a deadlift, and pairing a load with
     * somebody else's repetition count would produce a maximum nobody lifted.
     */
    const reps =
      test.rows.find(
        (other) =>
          other.measurementTypeKey === REPETITIONS_KEY && other.coordinates === row.coordinates,
      )?.value ?? null;

    const oneRepMaxKg = reps === null ? null : epleyOneRepMax(row.value, reps);
    const bodyWeightKg = athlete.weightKg;

    return {
      key: row.key,
      label: row.coordinates === '' ? row.typeName : row.coordinates,
      loadKg: row.value,
      repetitions: reps,
      oneRepMaxKg,
      standing:
        oneRepMaxKg === null || bodyWeightKg === null || athlete.sex === null
          ? null
          : strengthStanding({
              oneRepMaxKg,
              bodyWeightKg,
              exerciseKey: row.exerciseKey,
              sex: athlete.sex,
            }),
    };
  });

  return { lifts };
}

/** The derived percentage a body-composition test exists to produce. */
const BODY_FAT_KEY = 'body_fat';
const WEIGHT_KEY = 'weight';

/**
 * A body-composition test, read the way a coach reads it.
 *
 * ## Why this test gets its own shape
 *
 * Seven skinfolds are working numbers. Nobody acts on "Hautfalte Subscapular
 * 14 mm"; they act on the percentage those seven produce, and they read it next
 * to the weight, the BMI and the age that give it a size. Shown as ten equal
 * readings, the one number the test was performed for sits somewhere in the
 * middle of nine that are not.
 *
 * So the derived value is the headline, the context sits under it, and the
 * skinfolds go into a table where working numbers belong.
 *
 * Returns `null` for every test that is not one — the caller then renders the
 * ordinary tile, which is right for everything else.
 */
export function bodyFatView(
  test: DocumentTest,
  athlete: DocumentAthlete,
): {
  readonly headline: DocumentRow;
  readonly context: readonly { readonly label: string; readonly value: string }[];
  readonly table: readonly DocumentRow[];
} | null {
  const headline = test.rows.find((row) => row.measurementTypeKey === BODY_FAT_KEY);
  if (headline === undefined) return null;

  const weight = test.rows.find((row) => row.measurementTypeKey === WEIGHT_KEY);
  const context: { label: string; value: string }[] = [];

  if (weight !== undefined) {
    context.push({ label: 'Gewicht', value: formatValue(weight.value, weight.unit, WEIGHT_KEY) });
  }

  const bmi = bmiOf(weight?.value ?? null, athlete.heightCm);
  if (bmi !== null) context.push({ label: 'BMI', value: NUMBER.format(bmi) });

  const age = ageAt(athlete.dateOfBirth, test.performedAt);
  if (age !== null) context.push({ label: 'Alter', value: `${String(age)} Jahre` });

  return {
    headline,
    context,
    // Everything the percentage was worked out from, the headline included —
    // a coach checking a reading should not have to look in two places for it.
    table: test.rows,
  };
}

/**
 * Weight over height squared, or `null` where either is missing.
 *
 * The formula and nothing around it: no categories, no "normal" band. Those are
 * a judgement about a person, and a BMI band applied to an athlete with a lot of
 * muscle is exactly the kind of number that has the shape of evidence without
 * the substance. The figure is shown; what it means is the coach's sentence.
 */
function bmiOf(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg === null || heightCm === null || heightCm <= 0) return null;

  const metres = heightCm / 100;
  const bmi = weightKg / (metres * metres);

  return Number.isFinite(bmi) ? Math.round(bmi * 10) / 10 : null;
}

/**
 * Their age **on the day of the test**, not today.
 *
 * A document is a record of a day. An age that ticked over since publication
 * would make the frozen document disagree with itself.
 */
function ageAt(dateOfBirth: Date | null, on: Date): number | null {
  if (dateOfBirth === null || Number.isNaN(dateOfBirth.getTime())) return null;

  let years = on.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = on.getMonth() - dateOfBirth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < dateOfBirth.getDate())) years -= 1;

  return years >= 0 && years < 130 ? years : null;
}

export function headlineRows(test: DocumentTest): readonly DocumentRow[] {
  if (isStaged(test)) return [];
  if (test.movement === null) return test.rows;

  return test.rows.filter((row) => row.measurementTypeKey !== 'joint_angle');
}

/**
 * Results grouped by what they measure, for a diagram that never compares units.
 *
 * Only groups with something to compare: one duration on its own draws a full
 * bar and says nothing, four of them side by side say where the time went. This
 * is why the diagram appears for a HYROX assessment and stays away from a test
 * that recorded a single number.
 */
export function comparableGroups(tests: readonly DocumentTest[]): readonly {
  key: string;
  typeName: string;
  unit: string;
  rows: readonly { test: DocumentTest; row: DocumentRow }[];
}[] {
  const groups = new Map<string, { test: DocumentTest; row: DocumentRow }[]>();

  for (const test of tests) {
    // A staged test would enter its own stages as if they were separate tests —
    // "stage 5 against stage 3" is not a comparison, it is the curve above.
    if (isStaged(test)) continue;

    for (const row of headlineRows(test)) {
      const existing = groups.get(row.measurementTypeKey);
      if (existing) existing.push({ test, row });
      else groups.set(row.measurementTypeKey, [{ test, row }]);
    }
  }

  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({
      key,
      typeName: rows[0]!.row.typeName,
      unit: rows[0]!.row.unit,
      rows,
    }));
}
