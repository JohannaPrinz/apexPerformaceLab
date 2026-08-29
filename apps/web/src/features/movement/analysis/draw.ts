import { landmarkIndex, type Landmark, type POSE_LANDMARKS } from '@apex/domain';

/**
 * How a pose is drawn — once, for everyone who draws one.
 *
 * ## Why this is its own file
 *
 * Three surfaces now put the same skeleton on the same frames: the live overlay
 * during the analysis, the still images afterwards, and the annotated export.
 * Three copies would drift, and the failure mode is not cosmetic — a picture
 * whose bones sit somewhere other than where the numbers were measured is a
 * picture that argues against its own caption. This file is what stops that
 * being possible.
 *
 * ## What it does not do
 *
 * It never measures. Every angle it draws is handed in, already computed by the
 * analysis pass. Recomputing here was the bug that made the squat still
 * disagree with the table by 8–16°.
 */

/** The bones drawn: trunk and legs, which is what the shipped profile measures. */
const BONES: readonly (readonly [keyof typeof POSE_LANDMARKS, keyof typeof POSE_LANDMARKS])[] = [
  ['shoulder', 'hip'],
  ['hip', 'knee'],
  ['knee', 'ankle'],
  ['ankle', 'footIndex'],
];

/** The joints marked with a dot. */
const JOINTS = ['shoulder', 'hip', 'knee', 'ankle', 'footIndex'] as const;

/** The one accent the overlay uses, on video of any brightness. */
export const OVERLAY_ACCENT = '#ffb020';
export const OVERLAY_PLATE = 'rgba(0, 0, 0, 0.72)';

/**
 * Draws the skeleton onto a context already sized to the frame.
 *
 * `scale` exists because the same drawing has to read on a 320px preview and on
 * a 900px export: a 3px bone is right on one and invisible on the other.
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

  context.fillStyle = OVERLAY_ACCENT;
  for (const side of ['left', 'right'] as const) {
    for (const role of JOINTS) {
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
export function drawAngle(
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
  context.strokeStyle = OVERLAY_ACCENT;
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
  context.fillStyle = OVERLAY_PLATE;
  context.fillRect(
    textX - width / 2 - 6 * scale,
    textY - 11 * scale,
    width + 12 * scale,
    22 * scale,
  );

  context.fillStyle = OVERLAY_ACCENT;
  context.fillText(text, textX, textY);
}

/**
 * A line of text on a dark plate, aligned to one corner.
 *
 * Used for the caption on a still and for the counters on the export. Plated
 * rather than outlined because a recording may be bright, dark or both within
 * one repetition, and a plate is the only treatment that survives all three.
 */
export function drawPlatedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  colour = '#ffffff',
) {
  context.font = `${String(Math.round(15 * scale))}px system-ui, sans-serif`;
  context.textAlign = 'left';
  context.textBaseline = 'top';

  const width = context.measureText(text).width;

  context.fillStyle = OVERLAY_PLATE;
  context.fillRect(x, y, width + 20 * scale, 30 * scale);
  context.fillStyle = colour;
  context.fillText(text, x + 10 * scale, y + 8 * scale);

  return { width: width + 20 * scale, height: 30 * scale };
}
