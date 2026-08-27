import { POSE_LANDMARKS, type MovementSide } from './profile';

import type { Landmark } from './angles';
import type { PoseFrame } from './engine';

/**
 * A stick figure whose angles are known by construction.
 *
 * Synthetic rather than a recorded video, because what these tests answer is
 * "does the arithmetic hold together". Whether the model finds the right knee on
 * a real athlete is a question only a real athlete can answer, and a fixture
 * pretending otherwise would hide exactly that.
 *
 * Built in the sagittal plane: the shank tilts forward by `shank`, the thigh
 * back by `thigh`, so the knee angle is `180 - (shank + thigh)` — worked out once
 * here so every expectation elsewhere is a number that can be checked by hand.
 */

const DEG = Math.PI / 180;

export interface Posture {
  /** Shank tilt from vertical, in degrees. */
  readonly shank: number;
  /** Thigh tilt from vertical, in degrees. */
  readonly thigh: number;
  /** Trunk tilt from vertical, in degrees. */
  readonly trunk: number;
  /** Foot tilt from horizontal — what makes an ankle angle move at all. */
  readonly foot?: number;
  readonly visibility?: number;
  /** Visibility of the right side alone, where the two differ. */
  readonly rightVisibility?: number;
}

/** The knee angle this posture produces, by construction. */
export const kneeAngleOf = (posture: Posture) => 180 - (posture.shank + posture.thigh);

/** The hip angle this posture produces, by construction. */
export const hipAngleOf = (posture: Posture) => 180 - (posture.trunk + posture.thigh);

export function poseOf(posture: Posture): Landmark[] {
  const visibility = posture.visibility ?? 1;
  const right = posture.rightVisibility ?? visibility;
  const foot = posture.foot ?? 0;

  const point = (x: number, y: number, v: number): Landmark => ({ x, y, z: 0, visibility: v });

  const shankLength = 0.2;
  const thighLength = 0.2;
  const trunkLength = 0.28;
  const footLength = 0.09;

  const ankle = { x: 0.5, y: 0.9 };
  const knee = {
    x: ankle.x + shankLength * Math.sin(posture.shank * DEG),
    y: ankle.y - shankLength * Math.cos(posture.shank * DEG),
  };
  const hip = {
    x: knee.x - thighLength * Math.sin(posture.thigh * DEG),
    y: knee.y - thighLength * Math.cos(posture.thigh * DEG),
  };
  const shoulder = {
    x: hip.x + trunkLength * Math.sin(posture.trunk * DEG),
    y: hip.y - trunkLength * Math.cos(posture.trunk * DEG),
  };
  // Toe ahead of the ankle, lifted by `foot`.
  const toe = {
    x: ankle.x + footLength * Math.cos(foot * DEG),
    y: ankle.y - footLength * Math.sin(foot * DEG),
  };

  const pose: Landmark[] = Array.from({ length: 33 }, () => point(0, 0, visibility));

  const place = (role: keyof typeof POSE_LANDMARKS, at: { x: number; y: number }) => {
    pose[POSE_LANDMARKS[role].left] = point(at.x, at.y, visibility);
    // The far side, a hair behind the near one — enough to be a separate series
    // without changing the angles it produces.
    pose[POSE_LANDMARKS[role].right] = point(at.x + 0.01, at.y, right);
  };

  place('shoulder', shoulder);
  place('hip', hip);
  place('knee', knee);
  place('ankle', ankle);
  place('heel', { x: ankle.x - 0.03, y: ankle.y });
  place('footIndex', toe);

  return pose;
}

export const STANDING: Posture = { shank: 2, thigh: 3, trunk: 2, foot: 0 };
export const BOTTOM: Posture = { shank: 45, thigh: 55, trunk: 40, foot: 0 };

/** Interpolates between two postures. */
export const between = (from: Posture, to: Posture, t: number): Posture => ({
  shank: from.shank + (to.shank - from.shank) * t,
  thigh: from.thigh + (to.thigh - from.thigh) * t,
  trunk: from.trunk + (to.trunk - from.trunk) * t,
  foot: (from.foot ?? 0) + ((to.foot ?? 0) - (from.foot ?? 0)) * t,
  visibility: to.visibility ?? from.visibility,
  rightVisibility: to.rightVisibility ?? from.rightVisibility,
});

export interface Recording {
  readonly aspectRatio?: number;
  readonly fps?: number;
  readonly repFrames?: number;
  readonly standFrames?: number;
  readonly bottom?: Posture;
}

/** A recording of `count` squats, as frames a camera would have delivered. */
export function squatVideo(count: number, options: Recording = {}): PoseFrame[] {
  const fps = options.fps ?? 30;
  const repFrames = options.repFrames ?? 30;
  const standFrames = options.standFrames ?? 10;
  const aspectRatio = options.aspectRatio ?? 1;
  const bottom = options.bottom ?? BOTTOM;

  const postures: Posture[] = [];

  for (let rep = 0; rep < count; rep += 1) {
    for (let i = 0; i < standFrames; i += 1) postures.push(STANDING);
    for (let i = 0; i < repFrames; i += 1) {
      postures.push(between(STANDING, bottom, (i + 1) / repFrames));
    }
    for (let i = 0; i < repFrames; i += 1) {
      postures.push(between(bottom, STANDING, (i + 1) / repFrames));
    }
  }

  for (let i = 0; i < standFrames; i += 1) postures.push(STANDING);

  return postures.map((posture, index) => ({
    timestampMs: Math.round((index * 1000) / fps),
    landmarks: poseOf(posture),
    aspectRatio,
  }));
}

/** A recording with nobody in it. */
export function emptyVideo(frames: number): PoseFrame[] {
  return Array.from({ length: frames }, (_entry, index) => ({
    timestampMs: index * 33,
    landmarks: null,
    aspectRatio: 1,
  }));
}

export const SIDES: readonly MovementSide[] = ['left', 'right'];
