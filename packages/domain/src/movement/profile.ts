/**
 * What a movement is, declared rather than coded.
 *
 * ## The three roles this file keeps apart
 *
 * - A **profile** says which anatomical angles describe an exercise and how a
 *   repetition of it is recognised. It is a professional statement about the
 *   movement, the same for every workspace, and it contains no measurements.
 * - The **engine** (`engine.ts`) reads a profile and measures what MediaPipe
 *   actually saw. It knows nothing about squats.
 * - The **coach** decides, per test, which of the offered angles are relevant
 *   and what — if anything — they are aiming for. That lives in the test's
 *   configuration, never here.
 *
 * Collapsing any two of those is how "the analysis" quietly acquires opinions.
 * A profile that carried a mandatory target would be the platform prescribing a
 * depth; an engine that knew about knees could not be reused; a coach choice
 * stored in the profile would leak between tests.
 *
 * ## Why a profile is data and not a class
 *
 * Everything here is a plain value: landmark indices, thresholds, labels. That
 * is what makes "does the squat profile still measure the knee from hip, knee
 * and ankle" a test somebody can read, and what makes adding a movement a
 * reviewable diff rather than a new code path.
 */

/**
 * The landmarks a profile may build an angle from, per side.
 *
 * A closed set, named anatomically rather than numerically: `POSE_LANDMARKS.knee`
 * survives somebody reordering the constant, `25` does not. MediaPipe's full
 * pose has thirty-three points; these are the ones whose position is stable
 * enough on a clothed athlete filmed from the side to build an angle on.
 */
export const POSE_LANDMARKS = {
  shoulder: { left: 11, right: 12 },
  hip: { left: 23, right: 24 },
  knee: { left: 25, right: 26 },
  ankle: { left: 27, right: 28 },
  heel: { left: 29, right: 30 },
  footIndex: { left: 31, right: 32 },
} as const;

export type LandmarkRole = keyof typeof POSE_LANDMARKS;
export const LANDMARK_ROLES = Object.keys(POSE_LANDMARKS) as readonly LandmarkRole[];

export const MOVEMENT_SIDES = ['left', 'right'] as const;
export type MovementSide = (typeof MOVEMENT_SIDES)[number];

/** The landmark index for one role on one side. */
export function landmarkIndex(role: LandmarkRole, side: MovementSide): number {
  return POSE_LANDMARKS[role][side];
}

/**
 * One angle a profile measures.
 *
 * The angle is taken **at** `vertex`, between the limb towards `from` and the
 * limb towards `to`. Naming all three explicitly is what lets an ankle and a
 * knee be described by the same structure.
 */
export interface AngleTrackDefinition {
  /** Stable identifier. Part of the stored context, so never renamed. */
  readonly key: string;
  readonly label: string;
  readonly vertex: LandmarkRole;
  readonly from: LandmarkRole;
  readonly to: LandmarkRole;
  /**
   * What a coach should know before trusting it.
   *
   * Shown beside the angle when they choose. An ankle angle rests on the foot
   * landmarks, which a shoe and a trouser leg both degrade; saying so is not a
   * disclaimer, it is the difference between a number and an informed number.
   */
  readonly caution?: string;
}

/**
 * A named end of the movement.
 *
 * `end` says which extreme of the measured arc it is, not what it means: the
 * flexed knee of a squat is the arc's minimum, the extended one its maximum,
 * and a movement whose joint opens instead of closing would name them the other
 * way round without the engine changing.
 */
export interface MovementPositionDefinition {
  readonly key: string;
  readonly label: string;
  readonly end: 'min' | 'max';
}

/**
 * How repetitions are counted, if at all.
 *
 * `none` is a first-class case: a mobility hold or a static posture has angles
 * worth measuring and no repetitions at all, and forcing a count on it would
 * produce a zero that reads like a failure.
 */
export type RepetitionRule =
  | {
      readonly kind: 'hysteresis';
      /** Which track drives the count. One signal, never two (see `reps.ts`). */
      readonly track: string;
      readonly descendBelow: number;
      readonly ascendAbove: number;
      readonly minRepMs: number;
    }
  | { readonly kind: 'none' };

/** A target a profile *suggests*. Never applied without the coach saying so. */
export interface SuggestedTarget {
  readonly track: string;
  readonly position: string;
  readonly comparison: 'at_most' | 'at_least' | 'equals';
  readonly degrees: number;
}

export interface MovementProfile {
  readonly key: string;
  readonly name: string;
  readonly tracks: readonly AngleTrackDefinition[];
  readonly sides: readonly MovementSide[];
  readonly counting: RepetitionRule;
  readonly positions: readonly MovementPositionDefinition[];
  /**
   * Starting points for the coach, and nothing more.
   *
   * The interface offers them pre-filled and the coach confirms, changes or
   * removes each one. A profile that *applied* a target would be the platform
   * deciding how deep a squat should be — which it has no basis for, since it
   * ships no reference ranges (§12).
   */
  readonly suggestedTargets: readonly SuggestedTarget[];
}

/**
 * The squat, as the analysis has measured it all along.
 *
 * The thresholds are the ones that were already in use: this profile is a
 * description of existing behaviour, not a re-tuning of it. Changing them is a
 * separate decision with its own evidence.
 */
export const SQUAT_PROFILE: MovementProfile = {
  key: 'squat',
  name: 'Kniebeuge',
  sides: ['left', 'right'],
  tracks: [
    { key: 'knee', label: 'Knie', vertex: 'knee', from: 'hip', to: 'ankle' },
    { key: 'hip', label: 'Hüfte', vertex: 'hip', from: 'shoulder', to: 'knee' },
    {
      key: 'ankle',
      label: 'Sprunggelenk',
      vertex: 'ankle',
      from: 'knee',
      to: 'footIndex',
      // Included because the geometry genuinely supports it — knee, ankle and
      // toe are three landmarks MediaPipe returns — and flagged because the
      // foot is the least reliable of them: a shoe, a trouser leg or a foot
      // turned out of the filming plane all move `footIndex` without the ankle
      // moving. Offered, cautioned, and off by nobody's default but the coach's.
      caution:
        'Beruht auf den Fuß-Landmarks. Schuhe, lange Hosen oder ein aus der Filmebene gedrehter Fuß machen diesen Winkel unzuverlässiger als Knie und Hüfte.',
    },
  ],
  counting: {
    kind: 'hysteresis',
    track: 'knee',
    // Unchanged from the values the squat analysis already used.
    descendBelow: 120,
    ascendAbove: 155,
    minRepMs: 600,
  },
  positions: [
    { key: 'extended', label: 'gestreckt', end: 'max' },
    { key: 'flexed', label: 'gebeugt', end: 'min' },
  ],
  suggestedTargets: [
    // One suggestion, and only for the knee: a depth a coach commonly works to.
    // It arrives unticked in the sense that matters — the coach confirms it
    // before it is applied to anything.
    { track: 'knee', position: 'flexed', comparison: 'at_most', degrees: 90 },
  ],
};

/** Every profile the platform ships. One, deliberately. */
export const MOVEMENT_PROFILES: readonly MovementProfile[] = [SQUAT_PROFILE];

/**
 * Exercise key → profile key.
 *
 * A system-wide table rather than a column: which anatomy an exercise is
 * described by is the same statement in every workspace, so storing it per
 * organisation would invite two workspaces to disagree about what a squat is.
 * The exercise catalogue's keys are stable and never renamed once shipped
 * (§12a), which is what makes this safe without a migration.
 *
 * An exercise absent from this table simply has no profile, and the interface
 * says so rather than guessing at one.
 */
const PROFILE_BY_EXERCISE: Readonly<Record<string, string>> = {
  squat: 'squat',
};

/**
 * Every exercise key that can be analysed.
 *
 * Exported so a query can ask for exactly those rather than listing the whole
 * catalogue and filtering what came back — the catalogue runs to hundreds of
 * entries and any page of it would miss most of them.
 */
export const ANALYSABLE_EXERCISE_KEYS: readonly string[] = Object.keys(PROFILE_BY_EXERCISE);

/** The profile for a movement key, or `null` where none is defined. */
export function movementProfile(key: string | null | undefined): MovementProfile | null {
  if (key === null || key === undefined) return null;

  return MOVEMENT_PROFILES.find((profile) => profile.key === key) ?? null;
}

/**
 * The profile an exercise is analysed under, or `null`.
 *
 * `null` is an ordinary answer, not an error: most of the exercise catalogue has
 * no movement profile, and a screen that guessed one would analyse a bench press
 * as a squat and report knee angles for it.
 */
export function profileForExercise(exerciseKey: string | null | undefined): MovementProfile | null {
  if (exerciseKey === null || exerciseKey === undefined) return null;

  return movementProfile(PROFILE_BY_EXERCISE[exerciseKey]);
}

/** Whether an exercise can be analysed at all. */
export function hasMovementProfile(exerciseKey: string | null | undefined): boolean {
  return profileForExercise(exerciseKey) !== null;
}

/** A track of a profile by key, or `null`. */
export function trackOf(profile: MovementProfile, key: string): AngleTrackDefinition | null {
  return profile.tracks.find((track) => track.key === key) ?? null;
}

/** A position of a profile by key, or `null`. */
export function positionOf(
  profile: MovementProfile,
  key: string,
): MovementPositionDefinition | null {
  return profile.positions.find((position) => position.key === key) ?? null;
}

/** The identifier a measured series carries: track and side. */
export function seriesKeyOf(trackKey: string, side: MovementSide): string {
  return `${trackKey}_${side}`;
}
