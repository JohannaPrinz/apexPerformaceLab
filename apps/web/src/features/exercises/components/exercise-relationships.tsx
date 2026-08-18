import Link from 'next/link';

import { CATEGORY_LABELS, EQUIPMENT_LABELS, label } from './labels';

/**
 * The exercises this one is connected to, split by what the connection means.
 *
 * `alternative` and `related` are shown apart and never merged. Merging them
 * would tell a coach that a front squat can stand in for a back squat, which is
 * exactly the claim the curation refused to make — the type exists because the
 * difference matters at the moment of choosing.
 *
 * A section with no entries is not rendered. An empty "Alternativen" heading
 * reads as "there are none" only after the reader has spent attention on it.
 *
 * Nothing is derived here: what the API returns is what appears. No
 * transitivity, no widening — the stored pairs are the whole answer.
 */

export interface RelatedExerciseSummary {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly equipment: readonly string[];
  readonly relationship: string;
}

function Group({
  id,
  title,
  hint,
  exercises,
  muted = false,
}: {
  readonly id: string;
  readonly title: string;
  readonly hint: string;
  readonly exercises: readonly RelatedExerciseSummary[];
  readonly muted?: boolean;
}) {
  return (
    // Inside the disclosure the summary already names the group; a second,
    // screen-reader-only heading made it announce twice.
    <section className="flex flex-col gap-3" {...(muted ? {} : { 'aria-labelledby': id })}>
      <div className="flex flex-col gap-0.5">
        {muted ? null : (
          <h2 id={id} className="text-lg font-semibold">
            {title}
          </h2>
        )}
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {exercises.map((exercise) => (
          <li key={exercise.id}>
            <Link
              href={`/exercises/${exercise.id}`}
              className="flex flex-col gap-0.5 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="font-medium">{exercise.name}</span>
              <span className="text-xs text-muted-foreground">
                {[
                  exercise.category === null ? null : label(CATEGORY_LABELS, exercise.category),
                  exercise.equipment.length === 0
                    ? 'Körpergewicht'
                    : exercise.equipment.map((item) => label(EQUIPMENT_LABELS, item)).join(' · '),
                ]
                  .filter((fact): fact is string => fact !== null)
                  .join(' — ')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ExerciseRelationships({
  exercises,
}: {
  readonly exercises: readonly RelatedExerciseSummary[];
}) {
  // Anything that is not explicitly `alternative` counts as merely related.
  // The safe direction: a missing type must never promote a connection into a
  // recommendation to swap one exercise for another.
  const alternatives = exercises.filter((entry) => entry.relationship === 'alternative');
  const related = exercises.filter((entry) => entry.relationship !== 'alternative');

  if (alternatives.length === 0 && related.length === 0) return null;

  return (
    <div className="flex flex-col gap-8">
      {alternatives.length > 0 ? (
        <Group
          id="alternatives"
          title="Alternativen"
          hint="Können diese Übung ersetzen, wenn das Gerät fehlt oder die Bewegung nicht passt."
          exercises={alternatives}
        />
      ) : null}

      {/* Subordinated on purpose. "Alternative" answers a question a coach
          actually has — the rack is taken, what now. "Related" makes an offer,
          which is useful when building a programme and noise when picking one
          exercise. Kept, but quieter, and folded away until asked for. */}
      {related.length > 0 ? (
        <details className="border-t border-border pt-4">
          <summary className="w-fit cursor-pointer text-sm text-muted-foreground">
            Verwandte Übungen ({related.length})
          </summary>

          <div className="pt-4">
            <Group
              id="related"
              title="Verwandte Übungen"
              hint="Fachlich nah, aber nicht austauschbar — sie trainieren jeweils etwas Eigenes."
              exercises={related}
              muted
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
