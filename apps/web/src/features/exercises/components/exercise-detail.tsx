import { ExerciseThumbnail } from './exercise-thumbnail';
import {
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
  FORCE_TYPE_LABELS,
  label,
  MECHANIC_LABELS,
  MUSCLE_LABELS,
} from './labels';

/**
 * Everything a coach needs to judge one exercise.
 *
 * Order follows how the decision is made: the name and the sentence that
 * distinguishes it, then the media area, then how it is performed, and the
 * classification last. The attributes are what a filter is built from — useful
 * to confirm, rarely the reason to open the page.
 *
 * The English name appears only where it adds something. If it matches the
 * German one it is noise; the list decides this per search hit, but a detail
 * page has no search term, so the rule here is simply "different from the
 * German name".
 */

export interface ExerciseDetailData {
  readonly name: string;
  readonly canonicalName: string;
  readonly description: string | null;
  readonly instructions: readonly string[];
  readonly category: string | null;
  readonly difficulty: string | null;
  readonly forceType: string | null;
  readonly mechanic: string | null;
  readonly unilateral: boolean;
  readonly primaryMuscles: readonly string[];
  readonly secondaryMuscles: readonly string[];
  readonly equipment: readonly string[];
  readonly media?: unknown;
}

function Fact({ term, children }: { readonly term: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const list = (values: readonly string[], dictionary: Readonly<Record<string, string>>): string =>
  values.map((value) => label(dictionary, value)).join(', ');

export function ExerciseDetail({ exercise }: { readonly exercise: ExerciseDetailData }) {
  const showCanonical =
    exercise.canonicalName !== '' &&
    exercise.canonicalName.toLowerCase() !== exercise.name.toLowerCase();

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{exercise.name}</h1>

        {showCanonical ? (
          <p className="text-sm text-muted-foreground" data-testid="canonical-name">
            {exercise.canonicalName}
          </p>
        ) : null}

        {exercise.description === null || exercise.description === '' ? null : (
          <p className="text-pretty">{exercise.description}</p>
        )}
      </header>

      {/* The media area is a large version of the list placeholder. Every
          exercise carries `media: []` today, so this is the normal state and
          says so plainly rather than looking like a failed load. */}
      <section aria-label="Medien" className="flex items-center gap-4">
        <div className="origin-left scale-150">
          <ExerciseThumbnail name={exercise.name} media={exercise.media} />
        </div>
        <p className="pl-6 text-sm text-muted-foreground">
          Für diese Übung liegt noch kein Bild und kein Video vor.
        </p>
      </section>

      {exercise.instructions.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="instructions">
          <h2 id="instructions" className="text-lg font-semibold">
            Ausführung
          </h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-pretty">
            {exercise.instructions.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="attributes">
        <h2 id="attributes" className="text-lg font-semibold">
          Einordnung
        </h2>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {exercise.category === null ? null : (
            <Fact term="Kategorie">{label(CATEGORY_LABELS, exercise.category)}</Fact>
          )}
          {exercise.difficulty === null ? null : (
            <Fact term="Niveau">{label(DIFFICULTY_LABELS, exercise.difficulty)}</Fact>
          )}
          <Fact term="Seitigkeit">{exercise.unilateral ? 'Einseitig' : 'Beidseitig'}</Fact>

          {exercise.primaryMuscles.length === 0 ? null : (
            <Fact term="Primäre Muskeln">{list(exercise.primaryMuscles, MUSCLE_LABELS)}</Fact>
          )}
          {exercise.secondaryMuscles.length === 0 ? null : (
            <Fact term="Sekundäre Muskeln">{list(exercise.secondaryMuscles, MUSCLE_LABELS)}</Fact>
          )}

          <Fact term="Equipment">
            {exercise.equipment.length === 0
              ? 'Körpergewicht'
              : list(exercise.equipment, EQUIPMENT_LABELS)}
          </Fact>

          {exercise.forceType === null ? null : (
            <Fact term="Kraftrichtung">{label(FORCE_TYPE_LABELS, exercise.forceType)}</Fact>
          )}
          {exercise.mechanic === null ? null : (
            <Fact term="Gelenkbeteiligung">{label(MECHANIC_LABELS, exercise.mechanic)}</Fact>
          )}
        </dl>
      </section>
    </article>
  );
}
