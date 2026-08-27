import { describe, expect, it } from 'vitest';

import { analyseMovement, type MovementResult } from './engine';
import { squatVideo } from './figure.test-helper';
import { angleValueId, movementValues } from './plan';
import { SQUAT_PROFILE } from './profile';
import {
  checkTarget,
  checkTargets,
  describeTarget,
  MOVEMENT_REFUSAL_MESSAGES,
  summariseBlocks,
  summariseMovement,
} from './summary';

import type { AngleTargetConfig } from './analysis-config';

/**
 * The sentences a coach may paste into a note, and the target outcomes beside
 * them.
 *
 * Two things are pinned here. That the text **grades nothing** — the platform
 * ships no reference ranges, so "good depth" would be an opinion wearing the
 * clothes of a measurement, and it would end up in a report with the platform's
 * name on it. And that the text is computed from the **same values the table
 * shows**, so a corrected number cannot leave the two disagreeing.
 */

const ALL = SQUAT_PROFILE.tracks.map((track) => track.key);

function measure(tracks: readonly string[] = ALL): MovementResult {
  const outcome = analyseMovement(squatVideo(3), SQUAT_PROFILE, tracks);
  if (!outcome.ok) throw new Error('the fixture video should analyse');

  return outcome.result;
}

const RESULT = measure();
const VALUES = movementValues(RESULT, SQUAT_PROFILE);

const depth: AngleTargetConfig = {
  track: 'knee',
  position: 'flexed',
  comparison: 'at_most',
  degrees: 90,
};

const flexedKneeLeft = angleValueId('knee', 'left', 'flexed');
const flexedKneeRight = angleValueId('knee', 'right', 'flexed');

describe('the blocks the screen reads', () => {
  it('groups the sentences under headings a coach can scan', () => {
    const headings = summariseBlocks(RESULT, SQUAT_PROFILE, VALUES).map((block) => block.heading);

    expect(headings).toEqual(['Wiederholungen', 'Winkel', 'Bewegungsumfang', 'Aufnahme']);
  });

  it('names both positions of every measured track', () => {
    const winkel = summariseBlocks(RESULT, SQUAT_PROFILE, VALUES).find(
      (block) => block.heading === 'Winkel',
    );

    expect(winkel?.lines.join(' ')).toContain('Knie —');
    expect(winkel?.lines.join(' ')).toContain('gestreckt:');
    expect(winkel?.lines.join(' ')).toContain('gebeugt:');
  });

  it('says nothing about a track the coach deselected', () => {
    const kneeOnly = measure(['knee']);
    const text = summariseMovement(
      kneeOnly,
      SQUAT_PROFILE,
      movementValues(kneeOnly, SQUAT_PROFILE),
    );

    expect(text).toContain('Knie');
    expect(text).not.toContain('Hüfte');
    expect(text).not.toContain('Sprunggelenk');
  });

  it('says the same things as the flat text', () => {
    // The screen and the saved note must not become two accounts of one
    // analysis, which is why both are built from these blocks.
    const flat = summariseMovement(RESULT, SQUAT_PROFILE, VALUES);

    for (const block of summariseBlocks(RESULT, SQUAT_PROFILE, VALUES)) {
      for (const line of block.lines) expect(flat).toContain(line);
    }
  });

  it('grades nothing', () => {
    const text = summariseMovement(RESULT, SQUAT_PROFILE, VALUES, [depth]).toLowerCase();

    for (const verdict of [
      'gut',
      'schlecht',
      'besser',
      'optimal',
      'korrekt',
      'fehler',
      'risiko',
      'sollte',
      'empfehl',
      'zu tief',
      'zu wenig',
    ]) {
      expect(text).not.toContain(verdict);
    }
  });
});

describe('a target the coach set', () => {
  it('is absent from the text unless one was set', () => {
    expect(summariseMovement(RESULT, SQUAT_PROFILE, VALUES)).not.toContain('Ziel');
    expect(summariseMovement(RESULT, SQUAT_PROFILE, VALUES, [])).not.toContain('Ziel');
  });

  it('states the criterion, the measurement and the outcome', () => {
    const text = summariseMovement(RESULT, SQUAT_PROFILE, VALUES, [depth]);

    expect(text).toContain('Knie gebeugt: festgelegtes Ziel höchstens 90°');
    expect(text).toContain('Ziel erreicht');
  });

  it('says plainly when it was not reached', () => {
    const strict = { ...depth, degrees: 40 };

    expect(summariseMovement(RESULT, SQUAT_PROFILE, VALUES, [strict])).toContain(
      'Ziel nicht erreicht',
    );
  });

  it('is reached only when both sides reach it', () => {
    // Reporting the better side would be quiet flattery in an athlete's record.
    const measured = checkTarget(VALUES, SQUAT_PROFILE, depth).sides;

    expect(measured).toHaveLength(2);
    expect(checkTarget(VALUES, SQUAT_PROFILE, depth).verdict).toBe('reached');

    const onlyLeft = checkTarget(VALUES, SQUAT_PROFILE, depth, { [flexedKneeRight]: 130 });

    expect(onlyLeft.verdict).toBe('missed');
    expect(onlyLeft.sides.find((side) => side.side === 'LEFT')?.reached).toBe(true);
    expect(onlyLeft.sides.find((side) => side.side === 'RIGHT')?.reached).toBe(false);
  });

  it('follows a value the coach corrected', () => {
    // The whole reason the check reads the value list rather than the result:
    // an edited number must change the outcome without anything remembering to
    // recompute it.
    const before = checkTarget(VALUES, SQUAT_PROFILE, depth);
    const after = checkTarget(VALUES, SQUAT_PROFILE, depth, {
      [flexedKneeLeft]: 130,
      [flexedKneeRight]: 130,
    });

    expect(before.verdict).toBe('reached');
    expect(after.verdict).toBe('missed');
  });

  it('carries the corrected value into the sentence too', () => {
    const text = summariseMovement(RESULT, SQUAT_PROFILE, VALUES, [depth], {
      [flexedKneeLeft]: 130,
      [flexedKneeRight]: 130,
    });

    expect(text).toContain('130°');
    expect(text).toContain('Ziel nicht erreicht');
  });

  it('reports nothing measured rather than calling it a miss', () => {
    // An unmeasured angle is not a failed one.
    const kneeOnly = measure(['knee']);
    const outcome = checkTarget(movementValues(kneeOnly, SQUAT_PROFILE), SQUAT_PROFILE, {
      ...depth,
      track: 'hip',
    });

    expect(outcome.verdict).toBe('unmeasured');
    expect(describeTarget(outcome)).toContain('nichts gemessen');
  });

  it('checks every target it is given', () => {
    const outcomes = checkTargets(VALUES, SQUAT_PROFILE, [
      depth,
      { track: 'ankle', position: 'flexed', comparison: 'at_least', degrees: 25 },
    ]);

    expect(outcomes).toHaveLength(2);
    expect(outcomes.map((outcome) => outcome.label)).toEqual([
      'Knie gebeugt',
      'Sprunggelenk gebeugt',
    ]);
  });

  it('handles the three comparisons in the sentence', () => {
    const words = ['at_most', 'at_least', 'equals'] as const;
    const expected = ['höchstens', 'mindestens', 'genau'];

    words.forEach((comparison, index) => {
      const outcome = checkTarget(VALUES, SQUAT_PROFILE, { ...depth, comparison });

      expect(describeTarget(outcome)).toContain(expected[index]!);
    });
  });
});

describe('the refusals', () => {
  it('explains every refusal the engine can produce', () => {
    for (const message of Object.values(MOVEMENT_REFUSAL_MESSAGES)) {
      expect(message.length).toBeGreaterThan(20);
    }
  });

  it('says what to do rather than what went wrong internally', () => {
    expect(MOVEMENT_REFUSAL_MESSAGES.NO_POSE).toContain('im Bild');
    expect(MOVEMENT_REFUSAL_MESSAGES.NO_REPETITIONS).toContain('Stand');
  });
});
