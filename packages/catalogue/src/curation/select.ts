import {
  EXERCISE_CATEGORIES,
  EXERCISE_DIFFICULTIES,
  EXERCISE_FORCE_TYPES,
  EXERCISE_MECHANICS,
} from '@apex/domain';

import { composeGermanName } from './terms';

import type { Candidate } from '../candidates';

/**
 * Curating the pool down to a catalogue.
 *
 * Every decision below is a **rule**, written once and applied to all 1674
 * candidates, because a rule can be reviewed and a thousand individual
 * judgements cannot. Where a rule is not confident, the candidate is marked
 * `REVIEW` rather than guessed at — the point of this artefact is to be
 * reviewable, not to look finished.
 *
 * Nothing here writes anywhere. The output is three lists and a set of
 * proposals.
 */

// ── What is not an exercise of its own ───────────────────────────────────────

/**
 * Grip widths, foot positions, tempos and the like.
 *
 * These belong in `instructions`, not in a row of their own. The catalogue
 * would otherwise carry four bench presses that differ by hand spacing, and a
 * coach choosing one would be choosing a cue, not a movement.
 *
 * Each pattern says what it catches, because "why was this left out" is the
 * first question a reviewer will ask.
 */
export const EXECUTION_DETAIL_PATTERNS: readonly {
  readonly pattern: RegExp;
  readonly reason: string;
}[] = [
  {
    pattern: /\b(close|wide|narrow|medium|reverse|neutral|mixed)[- ]grip\b/i,
    reason: 'A grip width is a cue, not a movement.',
  },
  { pattern: /\b(grip)\b.*\b(variation|width)\b/i, reason: 'A grip variation is a cue.' },
  {
    pattern: /\b(feet|foot|stance)\b.*\b(close|wide|elevated|position)\b/i,
    reason: 'A foot position is a cue.',
  },
  {
    pattern: /\b(tempo|slow|fast|3-1-3|eccentric only)\b/i,
    reason: 'A tempo prescription is a cue.',
  },
  {
    pattern: /\b(palms?|thumb|finger)\b.*\b(up|down|in|out)\b/i,
    reason: 'A hand orientation is a cue.',
  },
  {
    pattern: /\bversion\b|\bvariation\b/i,
    reason: 'Named as a variation of another movement rather than a movement.',
  },
  {
    pattern: /\b(male|female|men|women)\b/i,
    reason: 'A demonstration detail, not a distinct movement.',
  },
  // Coaching cues and drill fragments the sources file as exercises. "Looking
  // At Ceiling" is a head position; "Linear 3-Part Start Technique" is a
  // teaching progression. Neither is something a coach puts in a plan.
  {
    pattern: /\b(looking at|elbows back|from stance|from 3 point|3-part|technique)\b/i,
    reason: 'A coaching cue or teaching progression, not a movement.',
  },
  {
    pattern: /\((single|multiple) response\)/i,
    reason: 'A drill protocol, not a distinct movement.',
  },
  {
    pattern: /\b(pyramid|drop set|superset|circuit|ladder)\b/i,
    reason: 'A set scheme, not a movement.',
  },
];

/** Movements that need equipment or a setting the catalogue does not serve. */
export const OUT_OF_SCOPE_PATTERNS: readonly {
  readonly pattern: RegExp;
  readonly reason: string;
}[] = [
  {
    pattern: /\b(smith machine)\b/i,
    reason: 'Machine-brand specific; the movement is covered by its free-weight form.',
  },
  {
    pattern: /\b(sled|prowler|tire|atlas stone|yoke|log press|keg)\b/i,
    reason: 'Strongman equipment, outside a general coaching catalogue.',
  },
  { pattern: /\b(bosu|vibration plate)\b/i, reason: 'Equipment outside our controlled list.' },
  {
    pattern: /\b(rope climb|pegboard|ring muscle)\b/i,
    reason: 'Apparatus outside a general coaching catalogue.',
  },
];

export function executionDetailReason(name: string): string | undefined {
  return EXECUTION_DETAIL_PATTERNS.find((entry) => entry.pattern.test(name))?.reason;
}

export function outOfScopeReason(name: string): string | undefined {
  return OUT_OF_SCOPE_PATTERNS.find((entry) => entry.pattern.test(name))?.reason;
}

// ── Movement patterns ────────────────────────────────────────────────────────

/**
 * The pattern a movement trains.
 *
 * Used for coverage, not stored on the exercise: the specification asks the
 * catalogue to span squat, hinge, lunge, press and pull rather than to record
 * which is which. A catalogue with forty presses and no hinge would pass every
 * taxonomy check and still be unusable.
 */
export const MOVEMENT_PATTERNS = [
  'squat',
  'hinge',
  'lunge',
  'knee_extension',
  'knee_flexion',
  'hip_abduction',
  'calf',
  'horizontal_press',
  'vertical_press',
  'horizontal_pull',
  'vertical_pull',
  'shoulder',
  'arm',
  'grip',
  'anti_extension',
  'anti_rotation',
  'anti_lateral_flexion',
  'trunk_flexion',
  'trunk_rotation',
  'olympic',
  'jump',
  'mobility',
  'carry',
  'conditioning',
  'other',
] as const;

export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

const PATTERN_RULES: readonly { readonly pattern: MovementPattern; readonly test: RegExp }[] = [
  { pattern: 'olympic', test: /\b(snatch|clean|jerk|high pull)\b/i },
  { pattern: 'jump', test: /\b(jump|hop|bound|burpee|plyo|depth|slam|throw|skater)\b/i },
  { pattern: 'lunge', test: /\b(lunge|split squat|step[- ]up|bulgarian)\b/i },
  { pattern: 'squat', test: /\b(squat|leg press|wall sit)\b/i },
  {
    pattern: 'hinge',
    test: /\b(deadlift|good morning|hip thrust|glute bridge|swing|back extension|hyperextension|pull[- ]through)\b/i,
  },
  { pattern: 'knee_extension', test: /\bleg extension\b/i },
  { pattern: 'knee_flexion', test: /\bleg curl\b/i },
  {
    pattern: 'hip_abduction',
    test: /\b(abduction|adduction|hip abductor|clamshell|monster walk|lateral band)\b/i,
  },
  { pattern: 'calf', test: /\b(calf|heel raise|toe raise)\b/i },
  {
    pattern: 'vertical_press',
    test: /\b(shoulder press|overhead press|military|push press|handstand)\b/i,
  },
  {
    pattern: 'horizontal_press',
    test: /\b(bench press|chest press|push[- ]?up|dip|fly|flye|pec deck)\b/i,
  },
  { pattern: 'vertical_pull', test: /\b(pull[- ]?up|chin[- ]?up|pulldown|pull[- ]down|lat)\b/i },
  { pattern: 'horizontal_pull', test: /\b(row|face pull|rear delt)\b/i },
  {
    pattern: 'shoulder',
    test: /\b(lateral raise|front raise|shrug|upright row|delt|external rotation|internal rotation)\b/i,
  },
  { pattern: 'arm', test: /\b(curl|triceps|tricep|pushdown|kickback|skull|extension)\b/i },
  { pattern: 'grip', test: /\b(wrist|grip|forearm|farmer)\b/i },
  {
    pattern: 'anti_rotation',
    test: /\b(pallof|anti[- ]rotation|wood ?chop|russian twist|landmine twist)\b/i,
  },
  { pattern: 'anti_lateral_flexion', test: /\b(side plank|suitcase|side bend)\b/i },
  { pattern: 'anti_extension', test: /\b(plank|rollout|dead bug|hollow|ab wheel|bird dog)\b/i },
  { pattern: 'trunk_rotation', test: /\b(twist|rotation|oblique)\b/i },
  { pattern: 'trunk_flexion', test: /\b(crunch|sit[- ]?up|leg raise|knee raise|v[- ]?up)\b/i },
  { pattern: 'carry', test: /\b(carry|walk|farmer)\b/i },
  {
    pattern: 'mobility',
    test: /\b(stretch|mobility|pose|cat|thread|circle|swing|opener|foam roll)\b/i,
  },
  {
    pattern: 'conditioning',
    test: /\b(run|sprint|rope|bike|cycl|row machine|erg|treadmill|elliptical|climber)\b/i,
  },
];

export function movementPattern(name: string): MovementPattern {
  return PATTERN_RULES.find((rule) => rule.test.test(name))?.pattern ?? 'other';
}

// ── Category refinement ──────────────────────────────────────────────────────

/**
 * Two categories no source carries.
 *
 * `stability` and `calisthenics` are ours (see the taxonomy). The sources file
 * their movements under `strength`, so a plank arrives as a strength exercise
 * and a pull-up as a strength exercise — which is not wrong, and is not useful
 * either.
 *
 * These rules move them, and they are **rules, not a list**: a movement held
 * against gravity without joint travel is stability; a bodyweight movement of
 * the calisthenics family is calisthenics. Everything else keeps the category
 * the sources agreed on.
 */
export function refineCategory(
  candidate: Candidate,
  pattern: MovementPattern,
): { category: string | undefined; changed: boolean; reason?: string } {
  const source = candidate.category;
  const name = candidate.suggestedCanonicalName;
  const bodyweight = candidate.equipment.length === 0;

  const isolationHold =
    /\b(plank|hold|bird dog|dead bug|pallof|hollow|wall sit|superman|bridge hold)\b/i.test(name);
  const antiPattern =
    pattern === 'anti_extension' ||
    pattern === 'anti_rotation' ||
    pattern === 'anti_lateral_flexion';

  if ((isolationHold || antiPattern) && (source === 'strength' || source === undefined)) {
    return {
      category: 'stability',
      changed: true,
      reason:
        'Held against gravity or resisting a direction rather than producing one — stability, which no source carries.',
    };
  }

  const calisthenicFamily =
    /\b(pull[- ]?up|chin[- ]?up|dip|push[- ]?up|muscle[- ]?up|handstand|pistol|l[- ]?sit|lever|bar hang|inverted row)\b/i.test(
      name,
    );

  if (bodyweight && calisthenicFamily && (source === 'strength' || source === undefined)) {
    return {
      category: 'calisthenics',
      changed: true,
      reason:
        'A bodyweight movement of the calisthenics family, which the sources file under strength.',
    };
  }

  return { category: source, changed: false };
}

// ── The curated entry ────────────────────────────────────────────────────────

export interface CuratedExercise {
  readonly key: string;
  /** German display name, composed from the term tables. */
  readonly name: string;
  readonly canonicalName: string;
  readonly description?: string | undefined;
  readonly instructions: readonly string[];
  readonly primaryMuscles: readonly string[];
  readonly secondaryMuscles: readonly string[];
  readonly equipment: readonly string[];
  readonly category: string;
  /** Null where the question does not apply — mobility, stability, endurance. */
  readonly forceType: string | null;
  readonly mechanic: string | null;
  readonly difficulty: string;
  readonly unilateral: boolean;
  /** External references only — nothing is downloaded or stored. */
  readonly media: readonly {
    readonly source: string;
    readonly url: string;
    readonly license: string;
  }[];
  readonly source: string;
  readonly sourceId: string;
  readonly license: string;
  /** Where a claim came from, kept even where one source was preferred. */
  readonly provenance: readonly {
    readonly source: string;
    readonly sourceId: string;
    readonly license: string;
  }[];
  readonly movementPattern: MovementPattern;
  /** Non-empty when a curator has to decide something. */
  readonly review: readonly string[];
  /** Source disagreements, with the proposal and why. */
  readonly conflicts: readonly {
    readonly field: string;
    readonly proposedValue: string | null;
    readonly sourceClaims: readonly string[];
    readonly rationale: string;
    readonly reviewRequired: boolean;
  }[];
}

export function keyFor(canonicalName: string): string {
  const key = canonicalName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70);

  return /^[a-z]/.test(key) ? key : `exercise_${key}`;
}

/** Whether the movement is performed one side at a time. */
export function isUnilateral(name: string): boolean {
  return /\b(single[- ](arm|leg)|one[- ](arm|leg)|unilateral|alternating|bulgarian|split squat|pistol|suitcase|lunge|step[- ]up|side plank)\b/i.test(
    name,
  );
}

/**
 * Where `forceType` and `mechanic` are a meaningful thing to ask.
 *
 * A stretch is neither push nor pull. Cycling is neither compound nor
 * isolation. The sources say so by leaving both null, and that is a correct
 * statement about the movement rather than a gap in the data — so requiring
 * them everywhere kept endurance out of the catalogue entirely.
 *
 * For these four they **are** meaningful and a missing value is a real gap,
 * reported for review. For `mobility`, `stability` and `endurance` they are
 * optional, and nothing invents a value to fill the column.
 */
export const CATEGORIES_REQUIRING_FORCE_AND_MECHANIC: ReadonlySet<string> = new Set([
  'strength',
  'olympic_weightlifting',
  'plyometrics',
  'calisthenics',
]);

const VALID = {
  category: new Set<string>(EXERCISE_CATEGORIES),
  forceType: new Set<string>(EXERCISE_FORCE_TYPES),
  mechanic: new Set<string>(EXERCISE_MECHANICS),
  difficulty: new Set<string>(EXERCISE_DIFFICULTIES),
};

/**
 * Turns a candidate into a curated entry, or says why it cannot.
 *
 * Provenance prefers **wrkout**: it is the public-domain source and the only
 * one carrying force, mechanic and difficulty. The other two remain in
 * `provenance` — they corroborated the movement even where their values were
 * not the ones taken.
 */
export function curate(
  candidate: Candidate,
): { ok: true; exercise: CuratedExercise } | { ok: false; reason: string } {
  const name = candidate.suggestedCanonicalName;

  const detail = executionDetailReason(name);
  if (detail) return { ok: false, reason: detail };

  const scope = outOfScopeReason(name);
  if (scope) return { ok: false, reason: scope };

  const primary =
    candidate.provenance.find((entry) => entry.source === 'wrkout') ?? candidate.provenance[0];

  if (!primary) return { ok: false, reason: 'No provenance — nothing to attribute the row to.' };

  const pattern = movementPattern(name);
  const refined = refineCategory(candidate, pattern);
  const german = composeGermanName(name);
  const review: string[] = [];

  if (german.name === '' || german.unknown.length > 0) {
    review.push(
      german.name === ''
        ? `No German term for "${name}". A person must name it.`
        : `German name composed without: ${german.unknown.join(', ')}.`,
    );
  }

  const classified = CATEGORIES_REQUIRING_FORCE_AND_MECHANIC.has(refined.category ?? '');

  for (const [field, value] of [
    ['category', refined.category],
    ['forceType', candidate.forceType],
    ['mechanic', candidate.mechanic],
    ['difficulty', candidate.difficulty],
  ] as const) {
    const optional = (field === 'forceType' || field === 'mechanic') && !classified;

    if (value === undefined) {
      if (!optional) review.push(`No ${field} — the sources do not agree or do not say.`);
    } else if (!VALID[field].has(value)) {
      review.push(`"${value}" is not a permitted ${field}.`);
    }
  }

  if (candidate.primaryMuscles.length === 0) review.push('No primary muscle.');
  if (!candidate.provenance.some(() => true)) review.push('No source.');

  const instructions =
    candidate.missing.includes('instructions') === false ? [] : ['__NEEDS_INSTRUCTIONS__'];

  const conflicts = candidate.conflicts.map((conflict) => ({
    field: conflict.field,
    proposedValue: null,
    sourceClaims: conflict.claims,
    rationale:
      'The sources disagree and no rule resolves it; both claims are kept so a person decides.',
    reviewRequired: true,
  }));

  if (conflicts.length > 0) review.push(`${String(conflicts.length)} source conflict(s).`);

  return {
    ok: true,
    exercise: {
      key: keyFor(name),
      name: german.name,
      canonicalName: name,
      description: undefined,
      instructions,
      primaryMuscles: candidate.primaryMuscles,
      secondaryMuscles: candidate.secondaryMuscles,
      equipment: candidate.equipment,
      category: refined.category ?? '',
      // Null, not an empty string: "this question does not apply to this
      // movement" is a different statement from "nobody filled it in", and the
      // column is nullable precisely so the first can be said.
      forceType: candidate.forceType ?? null,
      mechanic: candidate.mechanic ?? null,
      difficulty: candidate.difficulty ?? '',
      unilateral: isUnilateral(name),
      media: [],
      source: primary.source,
      sourceId: primary.sourceId,
      license: primary.license,
      provenance: candidate.provenance,
      movementPattern: pattern,
      review,
      conflicts,
    },
  };
}
