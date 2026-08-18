import Link from 'next/link';

import { Badge } from '@apex/ui';

import { ExerciseThumbnail } from './exercise-thumbnail';
import { CATEGORY_LABELS, DIFFICULTY_LABELS, EQUIPMENT_LABELS, label } from './labels';

/**
 * One exercise in the catalogue list.
 *
 * Shows what a coach needs to choose *without* opening the exercise: the German
 * name, the one-sentence description that distinguishes it from its neighbours,
 * and the three facts a filter is usually built from — category, equipment,
 * difficulty. Deliberately not a table: 276 rows of eleven columns is a
 * database view, and a coach is picking a movement, not auditing data.
 */

export interface ExerciseListItemProps {
  readonly exercise: {
    readonly id: string;
    readonly name: string;
    readonly canonicalName: string;
    readonly description: string | null;
    readonly category: string | null;
    readonly difficulty: string | null;
    readonly equipment: readonly string[];
    readonly unilateral: boolean;
    readonly media?: unknown;
  };
  /** What the coach typed, so a match on the English name can explain itself. */
  readonly search?: string | undefined;
  /** The list's own query, carried so the detail page can lead back to it. */
  readonly from?: string | undefined;
}

/**
 * Whether the English name earned its place on this row.
 *
 * Shown only when the search term is in the canonical name but **not** in the
 * German one — then the row would otherwise look like an unexplained hit. On a
 * German match the English name is noise: the coach already sees why the row is
 * there.
 */
export function shouldShowCanonicalName(
  { name, canonicalName }: { name: string; canonicalName: string },
  search: string | undefined,
): boolean {
  const term = search?.trim().toLowerCase();
  if (term === undefined || term === '') return false;
  if (canonicalName.toLowerCase() === name.toLowerCase()) return false;

  return canonicalName.toLowerCase().includes(term) && !name.toLowerCase().includes(term);
}

export function ExerciseListItem({ exercise, search, from }: ExerciseListItemProps) {
  const showCanonical = shouldShowCanonicalName(exercise, search);

  const facts = [
    exercise.category === null ? null : label(CATEGORY_LABELS, exercise.category),
    exercise.equipment.length === 0
      ? 'Körpergewicht'
      : exercise.equipment.map((item) => label(EQUIPMENT_LABELS, item)).join(' · '),
    exercise.difficulty === null ? null : label(DIFFICULTY_LABELS, exercise.difficulty),
  ].filter((fact): fact is string => fact !== null);

  return (
    <Link
      href={
        from === undefined || from === ''
          ? `/exercises/${exercise.id}`
          : `/exercises/${exercise.id}?from=${encodeURIComponent(from)}`
      }
      className="flex items-start gap-3 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ExerciseThumbnail name={exercise.name} media={exercise.media} />

      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium">{exercise.name}</span>

          {showCanonical ? (
            <span className="text-xs text-muted-foreground" data-testid="canonical-name">
              {exercise.canonicalName}
            </span>
          ) : null}

          {exercise.unilateral ? (
            <Badge variant="secondary" className="ml-auto">
              einseitig
            </Badge>
          ) : null}
        </span>

        {exercise.description === null || exercise.description === '' ? null : (
          <span className="text-sm text-pretty text-muted-foreground">{exercise.description}</span>
        )}

        <span className="text-xs text-muted-foreground">{facts.join(' — ')}</span>
      </span>
    </Link>
  );
}
