import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExerciseListItem, shouldShowCanonicalName } from './exercise-list-item';

/**
 * The row a coach scans before opening anything.
 *
 * The assertions go through role and text rather than markup, so the layout
 * stays free to change while the promises — name visible, link reachable,
 * English name only when it explains something — do not.
 */

const EXERCISE = {
  id: 'ex_1',
  name: 'Kniebeuge mit Langhantel',
  canonicalName: 'Barbell Squat',
  description: 'Die Kniebeuge mit der Langhantel im Nacken.',
  category: 'strength',
  difficulty: 'beginner',
  equipment: ['barbell'],
  unilateral: false,
} as const;

describe('an exercise row', () => {
  it('shows the German name and links to the exercise', () => {
    render(<ExerciseListItem exercise={EXERCISE} />);

    const link = screen.getByRole('link', { name: /Kniebeuge mit Langhantel/ });

    expect(link).toBeVisible();
    expect(link).toHaveAttribute('href', '/exercises/ex_1');
  });

  it('shows the distinguishing sentence without opening the exercise', () => {
    render(<ExerciseListItem exercise={EXERCISE} />);

    expect(screen.getByText('Die Kniebeuge mit der Langhantel im Nacken.')).toBeVisible();
  });

  it('translates the vocabularies a coach reads, not the keys we store', () => {
    render(<ExerciseListItem exercise={EXERCISE} />);

    expect(screen.getByText(/Kraft — Langhantel — Einsteiger/)).toBeVisible();
  });

  it('says bodyweight rather than leaving the equipment line empty', () => {
    render(<ExerciseListItem exercise={{ ...EXERCISE, equipment: [] }} />);

    expect(screen.getByText(/Körpergewicht/)).toBeVisible();
  });

  it('marks a one-sided exercise', () => {
    render(<ExerciseListItem exercise={{ ...EXERCISE, unilateral: true }} />);

    expect(screen.getByText('einseitig')).toBeVisible();
  });

  it('survives an exercise with no description', () => {
    render(<ExerciseListItem exercise={{ ...EXERCISE, description: null }} />);

    expect(screen.getByRole('link')).toBeVisible();
  });
});

/**
 * The rule from the brief: the English name is a *reason*, not decoration. It
 * appears when the hit cannot be explained by the German name, and stays away
 * otherwise.
 */
describe('when the English name is shown', () => {
  it('appears when only the canonical name matches the search', () => {
    render(<ExerciseListItem exercise={EXERCISE} search="squat" />);

    expect(screen.getByTestId('canonical-name')).toHaveTextContent('Barbell Squat');
  });

  it('stays hidden when the German name already explains the hit', () => {
    render(<ExerciseListItem exercise={EXERCISE} search="Kniebeuge" />);

    expect(screen.queryByTestId('canonical-name')).toBeNull();
  });

  it('stays hidden without a search term', () => {
    render(<ExerciseListItem exercise={EXERCISE} />);

    expect(screen.queryByTestId('canonical-name')).toBeNull();
  });

  it('decides case-insensitively and ignores surrounding space', () => {
    expect(shouldShowCanonicalName(EXERCISE, '  SQUAT  ')).toBe(true);
    expect(shouldShowCanonicalName(EXERCISE, 'KNIEBEUGE')).toBe(false);
  });

  it('says nothing when both names are the same word', () => {
    // "Burpee", "Dead Bug", "Double Under" — the German name *is* the English
    // one. Repeating it would look like a bug.
    expect(shouldShowCanonicalName({ name: 'Burpee', canonicalName: 'Burpee' }, 'burp')).toBe(
      false,
    );
  });
});
