/**
 * Joint angles from pose landmarks. Pure arithmetic, no MediaPipe types.
 *
 * ## Why the aspect ratio is an argument and not an afterthought
 *
 * MediaPipe's normalised landmarks put x and y in `[0, 1]` **relative to the
 * frame**, not to a square. On a 16:9 image one horizontal unit is 1.78× longer
 * than one vertical unit, so an angle computed on the raw values is wrong by up
 * to several degrees — silently, and worst where the limb is diagonal, which is
 * exactly mid-squat. Multiplying x by the aspect ratio restores the geometry.
 *
 * ## Why 2D and not the world landmarks
 *
 * MediaPipe also returns metric 3D world landmarks. For a squat filmed from the
 * side the movement lies in the image plane, so a corrected 2D angle measures
 * the thing directly, while the 3D angle inherits the depth axis — the one a
 * single RGB camera can only estimate. The 3D value is computed too, for the
 * proof of concept to compare them; the 2D one is what the screen shows.
 *
 * Nothing here judges. An angle is a number.
 */

export interface Landmark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** MediaPipe's own confidence that the point is visible. */
  readonly visibility?: number;
}

const RAD_TO_DEG = 180 / Math.PI;

/**
 * The angle at `vertex` between the two limbs, in degrees.
 *
 * `NaN` where a limb has no length — two landmarks on the same pixel carry no
 * direction, and returning 0 there would look like a fully closed joint.
 */
export function angleBetween(
  vertex: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const ax = a.x - vertex.x;
  const ay = a.y - vertex.y;
  const bx = b.x - vertex.x;
  const by = b.y - vertex.y;

  const lengthA = Math.hypot(ax, ay);
  const lengthB = Math.hypot(bx, by);
  if (lengthA === 0 || lengthB === 0) return Number.NaN;

  // Clamped because floating point can push a unit dot product past ±1, and
  // `Math.acos` returns NaN there rather than 0 or 180.
  const cosine = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (lengthA * lengthB)));

  return Math.acos(cosine) * RAD_TO_DEG;
}

/** The same in three dimensions, for comparing against the 2D value. */
export function angleBetween3D(vertex: Landmark, a: Landmark, b: Landmark): number {
  const ax = a.x - vertex.x;
  const ay = a.y - vertex.y;
  const az = a.z - vertex.z;
  const bx = b.x - vertex.x;
  const by = b.y - vertex.y;
  const bz = b.z - vertex.z;

  const lengthA = Math.hypot(ax, ay, az);
  const lengthB = Math.hypot(bx, by, bz);
  if (lengthA === 0 || lengthB === 0) return Number.NaN;

  const cosine = Math.min(1, Math.max(-1, (ax * bx + ay * by + az * bz) / (lengthA * lengthB)));

  return Math.acos(cosine) * RAD_TO_DEG;
}

/** Undoes the frame's aspect distortion so a diagonal limb keeps its length. */
export function corrected(landmark: Landmark, aspectRatio: number): Landmark {
  return { ...landmark, x: landmark.x * aspectRatio };
}

/**
 * How far the trunk leans from vertical, in degrees.
 *
 * Zero is upright. Stated as a magnitude without a direction: which way a
 * trunk leans depends on which way the athlete faces, and a single camera
 * cannot tell without being told.
 */
export function trunkLean(
  shoulder: { x: number; y: number },
  hip: { x: number; y: number },
): number {
  const dx = shoulder.x - hip.x;
  const dy = shoulder.y - hip.y;
  if (dx === 0 && dy === 0) return Number.NaN;

  // Image y grows downward, so an upright trunk has a negative dy.
  return Math.abs(Math.atan2(dx, -dy) * RAD_TO_DEG);
}

/** Indices into MediaPipe's 33-point pose. */
export const POSE = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export interface SquatAngles {
  readonly leftKnee: number;
  readonly rightKnee: number;
  readonly leftHip: number;
  readonly rightHip: number;
  readonly trunkLean: number;
  /** The 3D knee angles, for comparison only. */
  readonly leftKnee3D: number;
  readonly rightKnee3D: number;
  /** The lowest visibility among the points these angles rest on. */
  readonly confidence: number;
  /**
   * The same, per side.
   *
   * A single camera sees one side of a squat better than the other — the far
   * leg is behind the near one for most of the movement. Which side a number
   * came from therefore matters, and averaging the two would mix a measured
   * angle with an estimated one.
   */
  readonly leftConfidence: number;
  readonly rightConfidence: number;
}

/**
 * The angles a squat is described by, or `null` where the pose is unusable.
 *
 * `null` rather than numbers-with-a-warning: an angle computed from a landmark
 * the model could not see is not a worse measurement, it is not a measurement.
 */
export function squatAngles(
  landmarks: readonly Landmark[],
  aspectRatio: number,
  minVisibility = 0.5,
): SquatAngles | null {
  const needed = Object.values(POSE);
  const points = needed.map((index) => landmarks[index]);
  if (points.some((point) => point === undefined)) return null;

  const confidence = Math.min(...points.map((point) => point?.visibility ?? 0));
  if (confidence < minVisibility) return null;

  const at = (index: number) => corrected(landmarks[index]!, aspectRatio);
  const raw = (index: number) => landmarks[index]!;

  return {
    leftKnee: angleBetween(at(POSE.leftKnee), at(POSE.leftHip), at(POSE.leftAnkle)),
    rightKnee: angleBetween(at(POSE.rightKnee), at(POSE.rightHip), at(POSE.rightAnkle)),
    leftHip: angleBetween(at(POSE.leftHip), at(POSE.leftShoulder), at(POSE.leftKnee)),
    rightHip: angleBetween(at(POSE.rightHip), at(POSE.rightShoulder), at(POSE.rightKnee)),
    trunkLean: trunkLean(
      midpoint(at(POSE.leftShoulder), at(POSE.rightShoulder)),
      midpoint(at(POSE.leftHip), at(POSE.rightHip)),
    ),
    leftKnee3D: angleBetween3D(raw(POSE.leftKnee), raw(POSE.leftHip), raw(POSE.leftAnkle)),
    rightKnee3D: angleBetween3D(raw(POSE.rightKnee), raw(POSE.rightHip), raw(POSE.rightAnkle)),
    confidence,
    leftConfidence: weakestOf(landmarks, [
      POSE.leftShoulder,
      POSE.leftHip,
      POSE.leftKnee,
      POSE.leftAnkle,
    ]),
    rightConfidence: weakestOf(landmarks, [
      POSE.rightShoulder,
      POSE.rightHip,
      POSE.rightKnee,
      POSE.rightAnkle,
    ]),
  };
}

/** The weakest visibility among a set of points — what a side is worth. */
function weakestOf(landmarks: readonly Landmark[], indices: readonly number[]): number {
  return Math.min(...indices.map((index) => landmarks[index]?.visibility ?? 0));
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * A median over the last few frames.
 *
 * The pose estimate jitters by a degree or two between frames even when nobody
 * moves. A median rather than a mean because a single badly-placed landmark
 * produces an outlier, and a mean carries it into the result.
 */
export function median(values: readonly number[]): number {
  const usable = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (usable.length === 0) return Number.NaN;

  const middle = Math.floor(usable.length / 2);

  return usable.length % 2 === 0 ? (usable[middle - 1]! + usable[middle]!) / 2 : usable[middle]!;
}
