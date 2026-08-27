import { describe, expect, it } from 'vitest';

import {
  angleBetween,
  angleBetween3D,
  corrected,
  median,
  POSE,
  squatAngles,
  trunkLean,
  type Landmark,
} from './angles';

/**
 * The arithmetic behind the numbers on screen.
 *
 * Checked against angles that can be worked out by hand, because a joint angle
 * that is quietly wrong looks exactly like one that is right — and the aspect
 * correction is the part that is easiest to leave out and hardest to notice.
 */

const point = (x: number, y: number, z = 0, visibility = 1): Landmark => ({
  x,
  y,
  z,
  visibility,
});

describe('the angle at a joint', () => {
  it('is a right angle where the limbs are perpendicular', () => {
    expect(angleBetween(point(0, 0), point(1, 0), point(0, 1))).toBeCloseTo(90, 6);
  });

  it('is straight where the limbs point opposite ways', () => {
    expect(angleBetween(point(0, 0), point(1, 0), point(-1, 0))).toBeCloseTo(180, 6);
  });

  it('is nothing where the limbs point the same way', () => {
    expect(angleBetween(point(0, 0), point(1, 0), point(2, 0))).toBeCloseTo(0, 6);
  });

  it('is a known diagonal', () => {
    expect(angleBetween(point(0, 0), point(1, 0), point(1, 1))).toBeCloseTo(45, 6);
  });

  it('never returns zero for a limb with no length', () => {
    // Two landmarks on one pixel carry no direction. Zero would read as a
    // fully closed joint.
    expect(angleBetween(point(0, 0), point(0, 0), point(1, 0))).toBeNaN();
  });

  it('survives a dot product that floating point pushes past one', () => {
    // Unclamped, `Math.acos` returns NaN here rather than 0.
    expect(angleBetween(point(0, 0), point(0.1, 0.2), point(0.2, 0.4))).toBeCloseTo(0, 6);
  });

  it('measures the same angle in three dimensions', () => {
    expect(angleBetween3D(point(0, 0, 0), point(1, 0, 0), point(0, 1, 0))).toBeCloseTo(90, 6);
  });

  it('uses the depth axis where the limbs leave the image plane', () => {
    // Flat in 2D, a right angle in space — which is why the two values differ
    // and why the screen shows the one that matches the filming protocol.
    expect(angleBetween(point(0, 0), point(1, 0), point(0, 0.0001))).toBeGreaterThan(80);
    expect(angleBetween3D(point(0, 0, 0), point(1, 0, 0), point(0, 0, 1))).toBeCloseTo(90, 6);
  });
});

describe('the aspect correction', () => {
  it('leaves a square frame alone', () => {
    expect(corrected(point(0.4, 0.6), 1).x).toBe(0.4);
  });

  it('stretches x by the frame ratio', () => {
    expect(corrected(point(0.5, 0.5), 16 / 9).x).toBeCloseTo(0.888_9, 3);
  });

  it('changes a diagonal angle, which is the whole point', () => {
    // A limb at 45° in normalised coordinates is not at 45° on a 16:9 frame.
    // Without this, every mid-squat knee angle is wrong by several degrees.
    const vertex = point(0.5, 0.5);
    const a = point(0.5, 0.2);
    const b = point(0.8, 0.5);
    const ratio = 16 / 9;

    const raw = angleBetween(vertex, a, b);
    const fixed = angleBetween(corrected(vertex, ratio), corrected(a, ratio), corrected(b, ratio));

    expect(raw).toBeCloseTo(90, 6);
    expect(fixed).toBeCloseTo(90, 6);

    // And where the limb is diagonal rather than axis-aligned, they diverge.
    const diagonal = point(0.8, 0.2);
    const rawDiagonal = angleBetween(vertex, a, diagonal);
    const fixedDiagonal = angleBetween(
      corrected(vertex, ratio),
      corrected(a, ratio),
      corrected(diagonal, ratio),
    );

    expect(Math.abs(rawDiagonal - fixedDiagonal)).toBeGreaterThan(3);
  });
});

describe('how far the trunk leans', () => {
  it('is zero when upright', () => {
    // Image y grows downward, so the shoulder sits above the hip.
    expect(trunkLean(point(0.5, 0.2), point(0.5, 0.6))).toBeCloseTo(0, 6);
  });

  it('is a magnitude, whichever way the athlete faces', () => {
    const forward = trunkLean(point(0.6, 0.2), point(0.5, 0.6));
    const backward = trunkLean(point(0.4, 0.2), point(0.5, 0.6));

    expect(forward).toBeGreaterThan(0);
    expect(forward).toBeCloseTo(backward, 6);
  });

  it('is a right angle when the trunk is horizontal', () => {
    expect(trunkLean(point(0.9, 0.5), point(0.5, 0.5))).toBeCloseTo(90, 6);
  });
});

describe('the angles a squat is described by', () => {
  /** Standing upright: hip, knee and ankle in a line. */
  const standing = (): Landmark[] => {
    const pose: Landmark[] = Array.from({ length: 33 }, () => point(0, 0));
    pose[POSE.leftShoulder] = point(0.5, 0.2);
    pose[POSE.rightShoulder] = point(0.5, 0.2);
    pose[POSE.leftHip] = point(0.5, 0.5);
    pose[POSE.rightHip] = point(0.5, 0.5);
    pose[POSE.leftKnee] = point(0.5, 0.7);
    pose[POSE.rightKnee] = point(0.5, 0.7);
    pose[POSE.leftAnkle] = point(0.5, 0.9);
    pose[POSE.rightAnkle] = point(0.5, 0.9);

    return pose;
  };

  it('reads a straight leg as a straight angle', () => {
    const angles = squatAngles(standing(), 16 / 9);

    expect(angles?.leftKnee).toBeCloseTo(180, 4);
    expect(angles?.trunkLean).toBeCloseTo(0, 4);
  });

  it('reads a bent knee as a smaller angle', () => {
    const pose = standing();
    pose[POSE.leftKnee] = point(0.6, 0.7);

    const angles = squatAngles(pose, 16 / 9);

    expect(angles?.leftKnee).toBeLessThan(150);
  });

  it('refuses a pose the model could not see', () => {
    // Not a worse measurement — not a measurement.
    const pose = standing();
    pose[POSE.leftAnkle] = point(0.5, 0.9, 0, 0.1);

    expect(squatAngles(pose, 16 / 9)).toBeNull();
  });

  it('reports the weakest point it rests on', () => {
    const pose = standing();
    pose[POSE.rightAnkle] = point(0.5, 0.9, 0, 0.62);

    expect(squatAngles(pose, 16 / 9)?.confidence).toBeCloseTo(0.62, 6);
  });

  it('refuses a pose that is missing landmarks entirely', () => {
    expect(squatAngles([point(0.5, 0.5)], 16 / 9)).toBeNull();
  });

  it('keeps the two sides apart', () => {
    const pose = standing();
    pose[POSE.leftKnee] = point(0.6, 0.7);

    const angles = squatAngles(pose, 16 / 9);

    expect(angles?.leftKnee).not.toBeCloseTo(angles?.rightKnee ?? 0, 1);
  });
});

describe('the median over recent frames', () => {
  it('takes the middle of an odd run', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the middle two of an even run', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('ignores a single badly placed landmark', () => {
    // A mean would carry the outlier into the result; that is why this is a
    // median.
    expect(median([120, 121, 12, 122, 120])).toBe(120);
  });

  it('drops values that are not numbers', () => {
    expect(median([Number.NaN, 10, 20, 30])).toBe(20);
  });

  it('says nothing where there is nothing', () => {
    expect(median([])).toBeNaN();
  });
});
