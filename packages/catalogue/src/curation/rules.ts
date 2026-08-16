/**
 * Decisions that apply to the whole catalogue, not to one exercise.
 *
 * A rule belongs here when leaving it to per-exercise review would mean
 * answering the same question forty more times — and, worse, answering it
 * differently in block 7 than in block 2. The catalogue arrived with exactly
 * that: nine deadlift variants classified `pull` and two good mornings `push`,
 * for the same hip extension.
 *
 * Each rule reports *what it changed and why*, so a global correction is as
 * visible in the changelog as a hand-made one. A rule that silently rewrote
 * rows would be worse than the inconsistency it fixes.
 */

export interface RuleChange {
  readonly rule: string;
  readonly canonicalName: string;
  readonly field: string;
  readonly from: string;
  readonly to: string;
}

interface Subject {
  readonly canonicalName: string;
  readonly category: string;
  readonly forceType: string | null;
  readonly mechanic: string | null;
  readonly movementPattern: string;
}

/**
 * **D — explosive jump and throw movements are plyometrics.**
 *
 * The training intent decides the category, not the implement: a jump squat
 * trains power and reactivity whether or not a bar sits on the shoulders. Added
 * load does not turn it into a strength exercise.
 *
 * Olympic weightlifting is explosive too and stays where it is — it is its own
 * discipline, and a coach looking for a snatch does not look under plyometrics.
 */
const PLYOMETRIC_PATTERNS = new Set(['jump', 'throw']);

/**
 * **E — a hip hinge pulls.**
 *
 * Deadlift, Romanian deadlift and good morning are one movement family with the
 * load in different places. Splitting them across `push` and `pull` makes the
 * filter useless for precisely the coach who knows what they are looking for.
 */
const HINGE = /\b(deadlift|good morning)\b/i;

/**
 * **F — raises pull.**
 *
 * Front raise and lateral raise are the same lifting action at different angles.
 * The catalogue had the lateral raises on `pull` and the front raises on `push`.
 */
const RAISE = /\b(lateral raise|front raise|laterals)\b/i;

/**
 * **H — mobility is static and isolated.**
 *
 * Not a discovery, a convention. The catalogue had the same ten foam-rolling
 * entries split five to five between `static/isolation` and `static/—`, which
 * tells a reader nothing except that two people filled the field on different
 * days. Both values now say the same thing for every mobility entry.
 *
 * The rule reaches only `mobility`; where a movement genuinely belongs
 * elsewhere, the fix is the category, not the force type.
 */
export function globalRuleChanges(entry: Subject): readonly RuleChange[] {
  const changes: RuleChange[] = [];

  if (entry.category === 'mobility') {
    if (entry.forceType !== 'static') {
      changes.push({
        rule: 'H',
        canonicalName: entry.canonicalName,
        field: 'forceType',
        from: entry.forceType ?? '—',
        to: 'static',
      });
    }

    if (entry.mechanic !== 'isolation') {
      changes.push({
        rule: 'H',
        canonicalName: entry.canonicalName,
        field: 'mechanic',
        from: entry.mechanic ?? '—',
        to: 'isolation',
      });
    }

    return changes;
  }

  if (
    PLYOMETRIC_PATTERNS.has(entry.movementPattern) &&
    entry.category !== 'plyometrics' &&
    entry.category !== 'olympic_weightlifting'
  ) {
    changes.push({
      rule: 'D',
      canonicalName: entry.canonicalName,
      field: 'category',
      from: entry.category,
      to: 'plyometrics',
    });
  }

  const pulls = HINGE.test(entry.canonicalName) || RAISE.test(entry.canonicalName);

  if (pulls && entry.forceType !== null && entry.forceType !== 'pull') {
    changes.push({
      rule: HINGE.test(entry.canonicalName) ? 'E' : 'F',
      canonicalName: entry.canonicalName,
      field: 'forceType',
      from: entry.forceType,
      to: 'pull',
    });
  }

  return changes;
}

/**
 * **C — bodyweight alone does not make an exercise calisthenics.**
 *
 * Recorded as a rule that deliberately changes nothing. A hanging leg raise
 * without equipment stays `strength`; `calisthenics` is for the discipline —
 * muscle-ups, levers, the skill progressions — not for every movement that
 * happens to need no rack. Without this written down, the next reviewer would
 * reasonably reclassify the eleven bodyweight entries sitting in `strength`.
 */
export const BODYWEIGHT_STAYS_STRENGTH = true;
