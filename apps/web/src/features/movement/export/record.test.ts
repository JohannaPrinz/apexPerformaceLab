import { describe, expect, it } from 'vitest';

import type { AnnotatedFrame } from '@apex/domain';

import { annotationAt, annotatedExportSupport } from './record';

/**
 * Which annotation stands at a moment of the recording.
 *
 * The analysis samples at 15 frames a second; the export paints at whatever rate
 * the browser hands it. So most painted moments fall *between* two annotations,
 * and what is drawn there is a claim about what the analysis knew. The rule is
 * "the most recent one at or before" — never the nearest, which would show a
 * measurement before it was taken, and never an interpolation, which would show
 * a measurement that was never taken at all.
 */

const at = (timestampMs: number, knee: number): AnnotatedFrame => ({
  timestampMs,
  landmarks: null,
  angles: { knee_left: knee },
  signal: knee,
  repInProgress: null,
  completedReps: 0,
});

const FRAMES = [at(0, 175), at(66, 150), at(132, 120), at(198, 92)];

describe('the annotation that stands at a moment', () => {
  it('is the one exactly on it', () => {
    expect(annotationAt(FRAMES, 132)?.angles['knee_left']).toBe(120);
  });

  it('is the previous one between two samples', () => {
    // 100 ms sits between the samples at 66 and 132. What the analysis knew at
    // that instant is what it measured at 66.
    expect(annotationAt(FRAMES, 100)?.angles['knee_left']).toBe(150);
  });

  it('never reaches forward to a measurement not yet taken', () => {
    expect(annotationAt(FRAMES, 131)?.angles['knee_left']).toBe(150);
  });

  it('holds the last one past the end of the samples', () => {
    expect(annotationAt(FRAMES, 5000)?.angles['knee_left']).toBe(92);
  });

  it('has nothing to say before the first sample', () => {
    expect(annotationAt([at(40, 175)], 20)).toBeNull();
  });

  it('has nothing to say about an empty analysis', () => {
    expect(annotationAt([], 100)).toBeNull();
  });
});

describe('whether this browser can produce the file', () => {
  it('answers with a reason rather than a bare no', () => {
    // jsdom carries neither `MediaRecorder` nor `captureStream`, which is the
    // case a real Safari may hit too — so the refusal has to be sayable.
    const support = annotatedExportSupport();

    if (!support.supported) {
      expect(support.reason).toBeTruthy();
      expect(support.mimeType).toBeNull();
    } else {
      expect(support.mimeType).toBeTruthy();
      expect(support.reason).toBeNull();
    }
  });
});
