import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExerciseFilters, hasActiveFilters } from './exercise-filters';

/**
 * The filter bar keeps its state in the URL and nowhere else. These tests pin
 * the two things that make that work: every filter is a named form field, and
 * `page` is not one.
 */

describe('the filter bar', () => {
  it('offers every API filter as a named field', () => {
    render(<ExerciseFilters values={{}} />);

    const form = screen.getByRole('form', { name: 'Übungen filtern' });
    const names = [...form.querySelectorAll('[name]')].map((field) => field.getAttribute('name'));

    expect(names).toEqual(
      expect.arrayContaining([
        'q',
        'category',
        'primaryMuscle',
        'secondaryMuscle',
        'equipment',
        'difficulty',
        'unilateral',
        'forceType',
        'mechanic',
      ]),
    );
  });

  /**
   * Submitting must drop the page, which is how changing a filter returns to
   * page one. A hidden `page` field would carry the old page into a result set
   * that may no longer have it.
   */
  it('carries no page field, so applying a filter resets to page one', () => {
    render(<ExerciseFilters values={{ q: 'Kniebeuge' }} />);

    const form = screen.getByRole('form', { name: 'Übungen filtern' });

    expect(form.querySelector('[name="page"]')).toBeNull();
  });

  it('shows the German labels, not the stored keys', () => {
    render(<ExerciseFilters values={{}} />);

    expect(screen.getByRole('option', { name: 'Kraft' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Langhantel' })).toBeInTheDocument();
    // Twice: the primary and the secondary muscle select share one vocabulary.
    expect(screen.getAllByRole('option', { name: 'Beinrückseite' })).toHaveLength(2);
  });

  it('preselects what the URL already narrowed', () => {
    render(<ExerciseFilters values={{ category: 'strength', equipment: 'dumbbell' }} />);

    expect(screen.getByLabelText('Kategorie')).toHaveValue('strength');
    expect(screen.getByLabelText('Equipment')).toHaveValue('dumbbell');
  });

  it('offers a reset only when something is narrowed', () => {
    render(<ExerciseFilters values={{}} />);
    expect(screen.queryByRole('link', { name: 'Filter zurücksetzen' })).toBeNull();

    render(<ExerciseFilters values={{ category: 'strength' }} />);
    expect(screen.getByRole('link', { name: 'Filter zurücksetzen' })).toHaveAttribute(
      'href',
      '/exercises',
    );
  });

  it('opens the secondary group when one of its filters is in use', () => {
    render(<ExerciseFilters values={{ mechanic: 'isolation' }} />);

    expect(screen.getByText('Weitere Filter').closest('details')).toHaveAttribute('open');
  });

  it('keeps the secondary group closed by default', () => {
    render(<ExerciseFilters values={{ category: 'strength' }} />);

    expect(screen.getByText('Weitere Filter').closest('details')).not.toHaveAttribute('open');
  });
});

describe('detecting an active filter', () => {
  it('is false for nothing and for empty strings', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ q: '', category: undefined })).toBe(false);
  });

  it('is true for any single narrowing', () => {
    expect(hasActiveFilters({ mechanic: 'isolation' })).toBe(true);
    expect(hasActiveFilters({ q: 'Kniebeuge' })).toBe(true);
  });
});
