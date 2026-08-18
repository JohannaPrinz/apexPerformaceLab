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

    expect(screen.getAllByRole('option', { name: 'Kraft' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('option', { name: 'Langhantel' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('option', { name: 'Beinrückseite' }).length).toBeGreaterThan(0);
  });

  it('preselects what the URL already narrowed', () => {
    render(<ExerciseFilters values={{ category: 'strength', equipment: 'dumbbell' }} />);

    for (const field of screen.getAllByLabelText('Kategorie')) {
      expect(field).toHaveValue('strength');
    }
    for (const field of screen.getAllByLabelText('Equipment')) {
      expect(field).toHaveValue('dumbbell');
    }
  });

  /**
   * The regression this restructuring exists for: the mobile branch once held
   * only the search field, which left a phone with no filters at all.
   */
  it('offers the same eight filters in both layouts', () => {
    render(<ExerciseFilters values={{}} />);

    for (const name of [
      'category',
      'primaryMuscle',
      'equipment',
      'difficulty',
      'unilateral',
      'secondaryMuscle',
      'forceType',
      'mechanic',
    ]) {
      const form = screen.getByRole('form', { name: 'Übungen filtern' });

      // One in the desktop row, one in the phone disclosure.
      expect(form.querySelectorAll(`[name="${name}"]`), name).toHaveLength(2);
    }
  });

  it('folds the phone controls away and counts what is narrowed', () => {
    render(<ExerciseFilters values={{ category: 'strength', q: 'Kniebeuge' }} />);

    expect(screen.getByText('Suchen und filtern (2)')).toBeVisible();
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

    expect(screen.getAllByText('Weitere Filter')[0]?.closest('details')).toHaveAttribute('open');
  });

  it('keeps the secondary group closed by default', () => {
    render(<ExerciseFilters values={{ category: 'strength' }} />);

    expect(screen.getAllByText('Weitere Filter')[0]?.closest('details')).not.toHaveAttribute(
      'open',
    );
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
