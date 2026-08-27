import {
  angleBetween,
  corrected,
  landmarkIndex,
  type KeyFrame,
  type Landmark,
  type MovementProfile,
  type MovementSide,
  type POSE_LANDMARKS,
} from '@apex/domain';

import type { LoadedVideo } from './video-reader';

/**
 * Still images that show where the numbers came from.
 *
 * ## Why this exists
 *
 * "Knie gebeugt 87°" is a claim about a video the coach may have watched once.
 * One picture per named position, with the measured angles drawn on it, turns
 * that claim into something checkable in a glance. A number nobody can trace is
 * a number nobody should sign off.
 *
 * ## Why the pose is handed in rather than measured again
 *
 * The landmarks come from the analysis pass itself. Re-detecting these frames
 * afterwards was **measured** to disagree with the analysis by 8–16° on the
 * identical frame: sequential tracking and single-frame detection are different
 * measurements, and a picture whose caption contradicts the table beside it
 * explains nothing.
 *
 * So this file no longer runs the model at all. It seeks to the moment, draws
 * the frame, and puts the analysis's own numbers on it — which is the only way
 * the picture and the table can be talking about the same thing.
 *
 * ## Nothing is uploaded
 *
 * The frames are drawn to a canvas in this tab and read back as data URLs. They
 * live in React state while the screen is open and are then gone.
 */

/** One angle drawn on a still. */
export interface DrawnAngle {
  readonly track: string;
  readonly label: string;
  readonly degrees: number;
}

export interface Keyframe {
  /** The position key it belongs to, e.g. `flexed`. */
  readonly position: string;
  readonly label: string;
  readonly timestampMs: number;
  /** A PNG data URL. Never leaves the browser. */
  readonly dataUrl: string;
  readonly angles: readonly DrawnAngle[];
  readonly side: MovementSide;
}

/** Longest edge of a still. Big enough to read, small enough to hold in memory. */
const MAX_EDGE = 900;

/** The bones drawn: trunk and legs, which is what the shipped profile measures. */
const BONES: readonly (readonly [keyof typeof POSE_LANDMARKS, keyof typeof POSE_LANDMARKS])[] = [
  ['shoulder', 'hip'],
  ['hip', 'knee'],
  ['knee', 'ankle'],
  ['ankle', 'footIndex'],
];

function seek(element: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Standbild nicht erreichbar.'));
    }, 5000);

    const done = () => {
      cleanup();
      resolve();
    };

    function cleanup() {
      clearTimeout(timer);
      element.removeEventListener('seeked', done);
    }

    element.addEventListener('seeked', done);
    element.currentTime = timeSec;
  });
}

/**
 * Draws the skeleton onto a context already sized to the frame.
 *
 * Shared with the live preview: the overlay a coach watches during the analysis
 * and the still produced afterwards must draw the same points the same way, or
 * one of them is quietly lying about what the model saw.
 */
export function drawSkeleton(
  context: CanvasRenderingContext2D,
  landmarks: readonly Landmark[],
  width: number,
  height: number,
  scale = 1,
) {
  const at = (index: number) => {
    const point = landmarks[index];

    return point === undefined ? null : { x: point.x * width, y: point.y * height };
  };

  context.lineCap = 'round';
  context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  context.lineWidth = 3 * scale;

  for (const side of ['left', 'right'] as const) {
    for (const [from, to] of BONES) {
      const a = at(landmarkIndex(from, side));
      const b = at(landmarkIndex(to, side));
      if (!a || !b) continue;

      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }

  context.fillStyle = '#ffb020';
  for (const side of ['left', 'right'] as const) {
    for (const role of ['shoulder', 'hip', 'knee', 'ankle', 'footIndex'] as const) {
      const point = at(landmarkIndex(role, side));
      if (!point) continue;

      context.beginPath();
      context.arc(point.x, point.y, 3.5 * scale, 0, Math.PI * 2);
      context.fill();
    }
  }
}

/**
 * Draws the angle at a joint as an arc plus its value.
 *
 * The arc is drawn the **shorter** way round, which is the angle that was
 * measured — the reflex angle would be a different number and would look like an
 * error to anyone checking.
 */
function drawAngle(
  context: CanvasRenderingContext2D,
  vertex: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  degrees: number,
  label: string,
  scale: number,
) {
  if (!Number.isFinite(degrees)) return;

  const from = Math.atan2(a.y - vertex.y, a.x - vertex.x);
  const to = Math.atan2(b.y - vertex.y, b.x - vertex.x);

  let delta = to - from;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  const radius = 26 * scale;

  context.beginPath();
  context.arc(vertex.x, vertex.y, radius, from, from + delta, delta < 0);
  context.strokeStyle = '#ffb020';
  context.lineWidth = 3 * scale;
  context.stroke();

  const middle = from + delta / 2;
  const textX = vertex.x + Math.cos(middle) * radius * 1.9;
  const textY = vertex.y + Math.sin(middle) * radius * 1.9;
  const text = `${label} ${String(Math.round(degrees))}°`;

  context.font = `${String(Math.round(15 * scale))}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const width = context.measureText(text).width;
  context.fillStyle = 'rgba(0, 0, 0, 0.72)';
  context.fillRect(
    textX - width / 2 - 6 * scale,
    textY - 11 * scale,
    width + 12 * scale,
    22 * scale,
  );

  context.fillStyle = '#ffb020';
  context.fillText(text, textX, textY);
}

/**
 * Renders one still with the skeleton and the selected angles drawn on it.
 *
 * Returns `null` where nothing could be measured — a picture with no angles on
 * it would not explain anything, and one with *wrong* angles would be worse.
 */
function render(
  video: HTMLVideoElement,
  landmarks: readonly Landmark[],
  profile: MovementProfile,
  tracks: readonly string[],
  position: { key: string; label: string },
  timestampMs: number,
  side: MovementSide,
  aspectRatio: number,
): { dataUrl: string; angles: DrawnAngle[] } | null {
  const ratio = video.videoWidth / Math.max(1, video.videoHeight);
  const width = ratio >= 1 ? MAX_EDGE : Math.round(MAX_EDGE * ratio);
  const height = ratio >= 1 ? Math.round(MAX_EDGE / ratio) : MAX_EDGE;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) return null;

  context.drawImage(video, 0, 0, width, height);

  const scale = width / 640;
  const pixel = (index: number) => {
    const point = landmarks[index];

    return point === undefined ? null : { x: point.x * width, y: point.y * height };
  };

  drawSkeleton(context, landmarks, width, height, scale);

  const angles: DrawnAngle[] = [];

  for (const track of profile.tracks) {
    if (!tracks.includes(track.key)) continue;

    const vertexIndex = landmarkIndex(track.vertex, side);
    const fromIndex = landmarkIndex(track.from, side);
    const toIndex = landmarkIndex(track.to, side);

    const points = [landmarks[vertexIndex], landmarks[fromIndex], landmarks[toIndex]];
    if (points.some((point) => point === undefined)) continue;

    // Read from this frame rather than trusting the analysis: this is the frame
    // being drawn, and a label disagreeing with its own picture would be worse
    // than no label.
    const degrees = angleBetween(
      corrected(landmarks[vertexIndex]!, aspectRatio),
      corrected(landmarks[fromIndex]!, aspectRatio),
      corrected(landmarks[toIndex]!, aspectRatio),
    );

    if (!Number.isFinite(degrees)) continue;

    const vertex = pixel(vertexIndex);
    const a = pixel(fromIndex);
    const b = pixel(toIndex);
    if (!vertex || !a || !b) continue;

    drawAngle(context, vertex, a, b, degrees, track.label, scale);
    angles.push({ track: track.key, label: track.label, degrees });
  }

  if (angles.length === 0) return null;

  // The caption, so a still pulled out of context still says what it shows.
  const caption = `${position.label} · Sekunde ${(timestampMs / 1000).toFixed(1).replace('.', ',')}`;

  context.font = `${String(Math.round(15 * scale))}px system-ui, sans-serif`;
  context.textAlign = 'left';
  context.textBaseline = 'top';
  const captionWidth = context.measureText(caption).width;

  context.fillStyle = 'rgba(0, 0, 0, 0.72)';
  context.fillRect(0, 0, captionWidth + 20 * scale, 30 * scale);
  context.fillStyle = '#ffffff';
  context.fillText(caption, 10 * scale, 8 * scale);

  return { dataUrl: canvas.toDataURL('image/png'), angles };
}

/**
 * Produces the stills for the moments the analysis picked out.
 *
 * Never throws for a moment it cannot render: a missing picture costs an
 * explanation, a failed analysis costs the whole result.
 */
export async function captureKeyframes(
  video: LoadedVideo,
  profile: MovementProfile,
  tracks: readonly string[],
  keyFrames: readonly KeyFrame[],
  side: MovementSide,
): Promise<readonly Keyframe[]> {
  const frames: Keyframe[] = [];
  const aspectRatio = video.clip.width / Math.max(1, video.clip.height);

  for (const moment of keyFrames) {
    const position = profile.positions.find((entry) => entry.key === moment.position);
    if (position === undefined) continue;

    try {
      await seek(video.element, moment.timestampMs / 1000);

      const drawn = render(
        video.element,
        moment.landmarks,
        profile,
        tracks,
        position,
        moment.timestampMs,
        side,
        aspectRatio,
      );

      if (drawn === null) continue;

      frames.push({
        position: position.key,
        label: position.label,
        timestampMs: moment.timestampMs,
        dataUrl: drawn.dataUrl,
        angles: drawn.angles,
        side,
      });
    } catch {
      // One still that could not be produced. The numbers stand regardless.
      continue;
    }
  }

  return frames;
}
