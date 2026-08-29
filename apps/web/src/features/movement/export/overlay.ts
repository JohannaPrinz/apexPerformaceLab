import {
  TARGET_COMPARISON_LABELS_DE,
  landmarkIndex,
  type AngleTargetConfig,
  type AnnotatedFrame,
  type MovementProfile,
  type MovementSide,
  type TargetOutcome,
} from '@apex/domain';

import { drawAngle, drawPlatedText, drawSkeleton, OVERLAY_PLATE } from '../analysis/draw';

/**
 * What goes on top of one frame of the exported video.
 *
 * ## The split, and why it is where it is
 *
 * `overlayFor` decides **what** is drawn and is pure — no canvas, no video, no
 * browser. `paintOverlay` does the drawing and decides nothing. That is what
 * makes the interesting half testable: which angle appears at which joint, what
 * the repetition counter says between repetitions, and — the one that matters —
 * that a target's *verdict* never appears on a frame.
 *
 * ## Why a frame carries the target but not the verdict
 *
 * A target speaks about the extreme of a repetition: "knee, flexed, at most
 * 90°". Any single frame is somewhere on the way there. Stamping "Ziel erreicht"
 * on a frame midway through a descent would be a claim the analysis never made,
 * and a coach scrubbing the export would read it as one.
 *
 * So every frame shows what was asked for — `Ziel: Knie gebeugt ≤ 90°` — and the
 * closing card shows whether it was met, taken from `checkTargets`, which is the
 * same source the table and the report text read. One source, three surfaces.
 *
 * ## Nothing here measures
 *
 * Every angle drawn comes from `AnnotatedFrame.angles`, which the analysis pass
 * produced while reading that frame. No second inference, and no arithmetic on
 * landmarks either.
 */

/** One angle as it appears on a frame. */
export interface OverlayAngle {
  readonly track: string;
  readonly label: string;
  readonly degrees: number;
  /** Landmark indices for the arc: vertex, and the two rays. */
  readonly vertex: number;
  readonly from: number;
  readonly to: number;
}

export interface FrameOverlay {
  /** Top left. `null` before the first repetition begins. */
  readonly counter: string | null;
  readonly angles: readonly OverlayAngle[];
  /** Bottom left, one line per target the coach set. */
  readonly targetLines: readonly string[];
  readonly timestampMs: number;
}

/** `track_side`, the key the engine stores its angles under. */
const seriesKey = (track: string, side: MovementSide) => `${track}_${side}`;

/** A target as one short line: what was asked for, never whether it was met. */
export function targetLine(target: AngleTargetConfig, profile: MovementProfile): string {
  const track = profile.tracks.find((entry) => entry.key === target.track);
  const position = profile.positions.find((entry) => entry.key === target.position);
  const comparison = TARGET_COMPARISON_LABELS_DE[target.comparison];

  return `Ziel: ${track?.label ?? target.track} ${position?.label ?? target.position} ${comparison} ${String(target.degrees)}°`;
}

/**
 * What one frame shows.
 *
 * The side is fixed for the whole export — the side the analysis saw more
 * clearly — rather than chosen per frame. Switching legs mid-video would make
 * the numbers jump for a reason no viewer could see.
 */
export function overlayFor(
  frame: AnnotatedFrame,
  profile: MovementProfile,
  tracks: readonly string[],
  targets: readonly AngleTargetConfig[],
  side: MovementSide,
): FrameOverlay {
  const angles: OverlayAngle[] = [];

  for (const track of profile.tracks) {
    if (!tracks.includes(track.key)) continue;

    const degrees = frame.angles[seriesKey(track.key, side)];
    if (degrees === undefined || !Number.isFinite(degrees)) continue;

    angles.push({
      track: track.key,
      label: track.label,
      degrees,
      vertex: landmarkIndex(track.vertex, side),
      from: landmarkIndex(track.from, side),
      to: landmarkIndex(track.to, side),
    });
  }

  /**
   * The counter.
   *
   * While a repetition runs it names that one; between repetitions it states
   * how many are complete. Blank before the first, because "0 Wiederholungen"
   * over the athlete still standing still reads like a verdict on them.
   */
  const counter =
    frame.repInProgress !== null
      ? `Wiederholung ${String(frame.repInProgress)}`
      : frame.completedReps === 0
        ? null
        : `${String(frame.completedReps)} ${frame.completedReps === 1 ? 'Wiederholung' : 'Wiederholungen'}`;

  return {
    counter,
    angles,
    targetLines: targets.map((target) => targetLine(target, profile)),
    timestampMs: frame.timestampMs,
  };
}

/** Draws one frame's overlay onto a context already holding the video image. */
export function paintOverlay(
  context: CanvasRenderingContext2D,
  overlay: FrameOverlay,
  frame: AnnotatedFrame,
  width: number,
  height: number,
) {
  const scale = width / 640;
  const { landmarks } = frame;

  if (landmarks !== null) {
    drawSkeleton(context, landmarks, width, height, scale);

    const pixel = (index: number) => {
      const point = landmarks[index];

      return point === undefined ? null : { x: point.x * width, y: point.y * height };
    };

    for (const angle of overlay.angles) {
      const vertex = pixel(angle.vertex);
      const a = pixel(angle.from);
      const b = pixel(angle.to);
      if (!vertex || !a || !b) continue;

      drawAngle(context, vertex, a, b, angle.degrees, angle.label, scale);
    }
  }

  let top = 0;
  if (overlay.counter !== null) {
    const drawn = drawPlatedText(context, overlay.counter, 0, top, scale);
    top += drawn.height + 4 * scale;
  }

  drawPlatedText(
    context,
    `Sekunde ${(overlay.timestampMs / 1000).toFixed(1).replace('.', ',')}`,
    0,
    top,
    scale,
  );

  let bottom = height - 30 * scale;
  for (const line of [...overlay.targetLines].reverse()) {
    drawPlatedText(context, line, 0, bottom, scale);
    bottom -= 34 * scale;
  }
}

/**
 * The closing card: what the analysis concluded, held for a couple of seconds.
 *
 * The one place a verdict appears, and it is the verdict `checkTargets`
 * produced — handed in, never recomputed here.
 */
export function summaryLines(
  repetitions: number,
  outcomes: readonly TargetOutcome[],
): readonly string[] {
  const lines = [`${String(repetitions)} ${repetitions === 1 ? 'Wiederholung' : 'Wiederholungen'}`];

  for (const outcome of outcomes) {
    const verdict =
      outcome.verdict === 'unmeasured'
        ? 'nicht gemessen'
        : outcome.verdict === 'reached'
          ? 'Ziel erreicht'
          : 'Ziel nicht erreicht';

    lines.push(`${outcome.label}: ${verdict}`);
  }

  return lines;
}

export function paintSummary(
  context: CanvasRenderingContext2D,
  lines: readonly string[],
  width: number,
  height: number,
) {
  /**
   * Scaled off the longer edge, unlike everything else here.
   *
   * The overlay on a frame is anchored to the body, so it scales with the width
   * the body is drawn across. This card is anchored to nothing — it fills the
   * frame — and a portrait clip 506px wide rendered it at two thirds the size of
   * the same card on a landscape clip of the same area. A browser run showed it
   * legible but meek; the card is the one thing in the export a coach may read
   * across a room.
   */
  const scale = Math.max(width, height) / 640;

  context.fillStyle = OVERLAY_PLATE;
  context.fillRect(0, 0, width, height);

  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const step = 34 * scale;
  const start = height / 2 - ((lines.length - 1) * step) / 2;

  lines.forEach((line, index) => {
    context.font = `${String(Math.round((index === 0 ? 24 : 18) * scale))}px system-ui, sans-serif`;
    context.fillStyle = index === 0 ? '#ffffff' : '#e6e6e6';
    context.fillText(line, width / 2, start + index * step);
  });
}
