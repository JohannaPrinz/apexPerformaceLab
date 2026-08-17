import Link from 'next/link';

import {
  EQUIPMENT,
  EXERCISE_CATEGORIES,
  EXERCISE_DIFFICULTIES,
  EXERCISE_FORCE_TYPES,
  EXERCISE_MECHANICS,
  MUSCLES,
} from '@apex/domain';
import { Button, Card, CardContent } from '@apex/ui';

import {
  ExerciseFilters,
  hasActiveFilters,
} from '@/features/exercises/components/exercise-filters';
import { ExerciseListItem } from '@/features/exercises/components/exercise-list-item';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Übungen',
};

/** Twenty-five rows: a screenful to scan, and short enough to page quickly. */
const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  category?: string;
  primaryMuscle?: string;
  secondaryMuscle?: string;
  equipment?: string;
  difficulty?: string;
  unilateral?: string;
  forceType?: string;
  mechanic?: string;
  page?: string;
}

/**
 * A URL parameter narrowed to its vocabulary.
 *
 * The URL is user input: `?category=banana` must not reach the API, and it must
 * not blank the other filters either. An unknown value is simply dropped, so a
 * hand-edited link degrades to a wider result instead of an error page.
 */
const oneOf = <T extends string>(allowed: readonly T[], value: string | undefined): T | undefined =>
  allowed.find((candidate) => candidate === value);

/** Only what is set, so an empty select never narrows anything. */
const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
};

/**
 * The exercise catalogue.
 *
 * A server component with a plain GET form: search, filters and page all live
 * in the URL. That is the whole state architecture — the back button works, a
 * result is a shareable link, and there is no second copy of the filter state to
 * keep in sync.
 *
 * **No filtering or paging happens here.** The API takes the parameters and the
 * database does the work; this page reads the URL and passes it on. A client
 * that sliced 276 rows itself would be a second answer to a question the API
 * already answers.
 */
export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const values = {
    q: clean(params.q),
    category: clean(params.category),
    primaryMuscle: clean(params.primaryMuscle),
    secondaryMuscle: clean(params.secondaryMuscle),
    equipment: clean(params.equipment),
    difficulty: clean(params.difficulty),
    unilateral: clean(params.unilateral),
    forceType: clean(params.forceType),
    mechanic: clean(params.mechanic),
  };

  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const filters = {
    includeArchived: false,
    ...(values.q ? { search: values.q } : {}),
    ...(oneOf(EXERCISE_CATEGORIES, values.category)
      ? { category: oneOf(EXERCISE_CATEGORIES, values.category) }
      : {}),
    ...(oneOf(MUSCLES, values.primaryMuscle) ? { primaryMuscles: values.primaryMuscle } : {}),
    ...(oneOf(MUSCLES, values.secondaryMuscle) ? { secondaryMuscles: values.secondaryMuscle } : {}),
    ...(oneOf(EQUIPMENT, values.equipment) ? { equipment: values.equipment } : {}),
    ...(oneOf(EXERCISE_DIFFICULTIES, values.difficulty)
      ? { difficulty: oneOf(EXERCISE_DIFFICULTIES, values.difficulty) }
      : {}),
    ...(oneOf(EXERCISE_FORCE_TYPES, values.forceType)
      ? { forceType: oneOf(EXERCISE_FORCE_TYPES, values.forceType) }
      : {}),
    ...(oneOf(EXERCISE_MECHANICS, values.mechanic)
      ? { mechanic: oneOf(EXERCISE_MECHANICS, values.mechanic) }
      : {}),
    ...(values.unilateral === undefined ? {} : { unilateral: values.unilateral === 'true' }),
  } as const;

  const [total, exercises] = await Promise.all([
    api.exercises.count(filters),
    api.exercises.list({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = (page - 1) * PAGE_SIZE + exercises.length;
  const narrowed = hasActiveFilters(values);

  /** Keeps every filter and moves only the page. */
  const pageHref = (target: number): string => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) query.set(key, value);
    }
    if (target > 1) query.set('page', String(target));

    const suffix = query.toString();

    return suffix === '' ? '/exercises' : `/exercises?${suffix}`;
  };

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <span className="eyebrow">Katalog</span>
        <h1 className="text-3xl font-semibold">Übungen</h1>
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? 'Keine Treffer'
            : `${String(first)}–${String(last)} von ${String(total)} Übungen`}
          {narrowed ? ' (gefiltert)' : ''}
        </p>
      </header>

      <ExerciseFilters values={values} />

      {exercises.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {narrowed
                ? 'Keine Übung passt zu dieser Auswahl.'
                : 'Der Katalog enthält noch keine Übungen.'}
            </p>
            {narrowed ? (
              <Button asChild variant="outline" size="sm">
                <a href="/exercises">Filter zurücksetzen</a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {exercises.map((exercise) => (
              <li key={exercise.id}>
                <ExerciseListItem exercise={exercise} search={values.q} />
              </li>
            ))}
          </ul>

          {pages > 1 ? (
            <nav className="flex items-center justify-between gap-4" aria-label="Seiten">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page - 1)}>Zurück</Link>
                </Button>
              ) : (
                <span />
              )}

              <span className="text-sm text-muted-foreground">
                Seite {page} von {pages}
              </span>

              {page < pages ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page + 1)}>Weiter</Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </main>
  );
}
