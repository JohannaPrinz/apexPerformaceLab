import {
  meetsTarget,
  TARGET_COMPARISON_LABELS_DE,
  type AngleTargetConfig,
} from './analysis-config';
import { measuredForTarget, type MovementValue } from './plan';
import { positionOf, trackOf, type MovementProfile } from './profile';

import type { MovementResult, MovementRefusal } from './engine';

/**
 * What the analysis found, in sentences — and how the targets came out.
 *
 * ## One source, two shapes
 *
 * The screen reads blocks, the note is a single editable field. Both are built
 * from `summariseBlocks`, and the target sentences are computed from the **same
 * `MovementValue` list** the table renders and the plan writes. That is what
 * stops the text and the table becoming two interpretations of one analysis —
 * and what makes a corrected number update both at once.
 *
 * ## Facts, and one kind of comparison
 *
 * Every sentence restates a number that was measured. The only comparison is
 * against a target the **coach** typed: reporting whether a measured angle meets
 * a number they supplied is arithmetic, not an opinion. Nothing here decides
 * what a good angle is; the platform ships no reference ranges and has no basis
 * to.
 */

const NUMBER = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

const seconds = (ms: number) => `${NUMBER.format(Math.round(ms / 100) / 10)} s`;
const degrees = (value: number) => `${NUMBER.format(value)}°`;

const SIDE_WORDS: Readonly<Record<string, string>> = {
  LEFT: 'links',
  RIGHT: 'rechts',
  BILATERAL: 'beidseitig',
};

/**
 * The heading of the range-of-motion block.
 *
 * Named because one caller drops it: the analysis screen shows the range beside
 * the angles it is the difference of, which is useful while reading a recording.
 * The remark that travels into a report and an athlete's profile does not — 95°
 * reached from 130° and from 175° are different movements, and only the angles
 * say which happened, so restating the difference there is the same fact twice.
 */
export const RANGE_HEADING = 'Bewegungsumfang';

export interface SummaryBlock {
  readonly heading: string;
  readonly lines: readonly string[];
}

export type TargetVerdict = 'reached' | 'missed' | 'unmeasured';

export interface TargetOutcome {
  readonly target: AngleTargetConfig;
  readonly verdict: TargetVerdict;
  readonly sides: readonly {
    readonly side: 'LEFT' | 'RIGHT' | 'BILATERAL';
    readonly degrees: number;
    readonly reached: boolean;
  }[];
  /** The label the interface shows, e.g. "Knie gebeugt". */
  readonly label: string;
}

/**
 * Checks one target against what was measured.
 *
 * Both sides must satisfy it for the whole check to count as reached. A squat
 * where one knee reaches the depth and the other does not has not reached it —
 * reporting the better side would be the kind of quiet flattery that makes a
 * record worthless.
 */
export function checkTarget(
  values: readonly MovementValue[],
  profile: MovementProfile,
  target: AngleTargetConfig,
  edited: Readonly<Record<string, number>> = {},
): TargetOutcome {
  const track = trackOf(profile, target.track);
  const position = positionOf(profile, target.position);
  const label = `${track?.label ?? target.track} ${position?.label ?? target.position}`;

  const measured = measuredForTarget(values, target, edited);

  if (measured.length === 0) return { target, verdict: 'unmeasured', sides: [], label };

  const sides = measured.map((entry) => ({
    side: entry.side,
    degrees: entry.degrees,
    reached: meetsTarget(entry.degrees, target),
  }));

  return {
    target,
    verdict: sides.every((entry) => entry.reached) ? 'reached' : 'missed',
    sides,
    label,
  };
}

/** Every target the coach set, checked. */
export function checkTargets(
  values: readonly MovementValue[],
  profile: MovementProfile,
  targets: readonly AngleTargetConfig[],
  edited: Readonly<Record<string, number>> = {},
): readonly TargetOutcome[] {
  return targets.map((target) => checkTarget(values, profile, target, edited));
}

/**
 * A target and its outcome as one factual sentence.
 *
 * States what was asked for, what was measured and whether the two meet. No
 * advice, no cause, no "should" — a coach who set the target already knows what
 * they meant by it.
 */
export function describeTarget(outcome: TargetOutcome): string {
  const asked =
    `${outcome.label}: festgelegtes Ziel ` +
    `${TARGET_COMPARISON_LABELS_DE[outcome.target.comparison]} ${degrees(outcome.target.degrees)}`;

  if (outcome.verdict === 'unmeasured') {
    return `${asked}. Dafür wurde nichts gemessen.`;
  }

  const measured = outcome.sides
    .map((entry) => `${SIDE_WORDS[entry.side] ?? entry.side} ${degrees(entry.degrees)}`)
    .join(', ');

  return `${asked}. Gemessen: ${measured} — ${
    outcome.verdict === 'reached' ? 'Ziel erreicht' : 'Ziel nicht erreicht'
  }.`;
}

/**
 * The summary as blocks.
 *
 * `values` rather than the raw result: the table shows those, the plan writes
 * those, and the coach edits those. Building the text from anything else would
 * make a corrected number disagree with the sentence beside it.
 */
export function summariseBlocks(
  result: MovementResult,
  profile: MovementProfile,
  values: readonly MovementValue[],
  targets: readonly AngleTargetConfig[] = [],
  edited: Readonly<Record<string, number>> = {},
): readonly SummaryBlock[] {
  const blocks: SummaryBlock[] = [];
  const valueOf = (id: string) => {
    const found = values.find((value) => value.id === id);

    return found === undefined ? undefined : (edited[id] ?? found.value);
  };

  if (profile.counting.kind === 'hysteresis') {
    const count = valueOf('repetitions') ?? result.repetitions;

    blocks.push({
      heading: 'Wiederholungen',
      lines: [
        `${NUMBER.format(count)} ${count === 1 ? 'Wiederholung' : 'Wiederholungen'} erkannt.`,
        `Dauer je Wiederholung: Ø ${seconds(result.meanRepDurationMs)}, Median ${seconds(
          result.medianRepDurationMs,
        )}.`,
      ],
    });
  }

  const angles: string[] = [];
  const ranges: string[] = [];

  for (const track of profile.tracks) {
    const perPosition = profile.positions
      .map((position) => {
        const parts = profile.sides
          .map((side) => {
            const value = values.find(
              (entry) =>
                entry.track === track.key &&
                entry.position === position.key &&
                entry.side === (side === 'left' ? 'LEFT' : 'RIGHT'),
            );

            return value === undefined
              ? null
              : `${side === 'left' ? 'links' : 'rechts'} ${degrees(edited[value.id] ?? value.value)}`;
          })
          .filter((part): part is string => part !== null);

        return parts.length === 0 ? null : `${position.label}: ${parts.join(', ')}`;
      })
      .filter((part): part is string => part !== null);

    if (perPosition.length > 0) angles.push(`${track.label} — ${perPosition.join('; ')}.`);

    const rangeParts = profile.sides
      .map((side) => {
        const value = values.find(
          (entry) =>
            entry.track === track.key &&
            entry.position === null &&
            entry.measurementKey === 'range_of_motion' &&
            entry.side === (side === 'left' ? 'LEFT' : 'RIGHT'),
        );

        return value === undefined
          ? null
          : `${side === 'left' ? 'links' : 'rechts'} ${degrees(edited[value.id] ?? value.value)}`;
      })
      .filter((part): part is string => part !== null);

    if (rangeParts.length > 0) ranges.push(`${track.label}: ${rangeParts.join(', ')}.`);
  }

  if (angles.length > 0) blocks.push({ heading: 'Winkel', lines: angles });
  if (ranges.length > 0) blocks.push({ heading: RANGE_HEADING, lines: ranges });

  blocks.push({
    heading: 'Aufnahme',
    lines: [
      `Ausgewertet: ${String(result.frames.usable)} von ${String(
        result.frames.total,
      )} Bildern; in ${String(result.frames.withoutPose)} Bildern war keine Person sicher erkennbar.`,
    ],
  });

  // Last, and only for targets the coach actually set: they are their criterion,
  // so they read as a closing check rather than as something the platform decided.
  const outcomes = checkTargets(values, profile, targets, edited);
  if (outcomes.length > 0) {
    blocks.push({ heading: 'Ziele', lines: outcomes.map(describeTarget) });
  }

  return blocks;
}

/** The same text as one editable field. */
export function summariseMovement(
  result: MovementResult,
  profile: MovementProfile,
  values: readonly MovementValue[],
  targets: readonly AngleTargetConfig[] = [],
  edited: Readonly<Record<string, number>> = {},
): string {
  return summariseBlocks(result, profile, values, targets, edited)
    .map((block) => `${block.heading}: ${block.lines.join(' ')}`)
    .join('\n\n');
}

/** Why no result could be produced, in words a coach can act on. */
export const MOVEMENT_REFUSAL_MESSAGES: Readonly<Record<MovementRefusal, string>> = {
  NO_POSE:
    'In diesem Video wurde keine Person erkannt. Bitte prüfen, ob die Athletin oder der Athlet vollständig im Bild ist.',
  POSE_TOO_INTERMITTENT:
    'Die Person war nur in einem Teil der Bilder erkennbar. Für eine Auswertung reicht das nicht — meist hilft mehr Abstand oder besseres Licht.',
  TOO_FEW_FRAMES:
    'Das Video enthält zu wenige auswertbare Bilder. Bitte eine längere Aufnahme verwenden.',
  NO_REPETITIONS:
    'Es wurde keine vollständige Wiederholung erkannt. Für die Zählung muss die Bewegung aus dem Stand nach unten und wieder zurück führen.',
} as const;

/**
 * The summary as a coach's remark — what a report and a profile will show.
 *
 * The range-of-motion block is left out for the reason given at `RANGE_HEADING`.
 * Everything else is the analysis's own wording, unchanged, so the remark a
 * coach edits starts from what they just read.
 */
export function remarkFrom(blocks: readonly SummaryBlock[]): string {
  return blocks
    .filter((block) => block.heading !== RANGE_HEADING)
    .map((block) => `${block.heading}: ${block.lines.join(' ')}`)
    .join('\n\n');
}
