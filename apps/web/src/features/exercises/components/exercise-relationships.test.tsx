import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExerciseRelationships } from './exercise-relationships';

/**
 * The two relationship kinds must stay apart. Merging them would tell a coach
 * that a front squat can replace a back squat — the claim the curation
 * deliberately refused to make.
 */

const entry = (id: string, name: string, relationship: string) => ({
  id,
  name,
  category: 'strength',
  equipment: ['barbell'],
  relationship,
});

describe('the relationship sections', () => {
  it('separates alternatives from related exercises', () => {
    render(
      <ExerciseRelationships
        exercises={[
          entry('a', 'Kniebeuge mit Kurzhanteln', 'alternative'),
          entry('b', 'Frontkniebeuge', 'related'),
        ]}
      />,
    );

    const alternatives = screen.getByRole('region', { name: 'Alternativen' });

    expect(within(alternatives).getByText('Kniebeuge mit Kurzhanteln')).toBeVisible();
    expect(within(alternatives).queryByText('Frontkniebeuge')).toBeNull();

    // Related is folded away by default, so it is found through its disclosure.
    const related = screen.getByRole('group');

    expect(within(related).getByText('Frontkniebeuge')).toBeInTheDocument();
  });

  /**
   * The safe direction. A connection whose kind is missing must not be promoted
   * into a recommendation to swap one exercise for another.
   */
  it('never treats a missing type as an alternative', () => {
    render(<ExerciseRelationships exercises={[entry('a', 'Unklar', '')]} />);

    expect(screen.queryByRole('region', { name: 'Alternativen' })).toBeNull();

    const related = screen.getByRole('group');

    expect(within(related).getByText('Unklar')).toBeInTheDocument();
  });

  it('links each connected exercise to its own page', () => {
    render(<ExerciseRelationships exercises={[entry('ex_7', 'Hack-Kniebeuge', 'alternative')]} />);

    expect(screen.getByRole('link', { name: /Hack-Kniebeuge/ })).toHaveAttribute(
      'href',
      '/exercises/ex_7',
    );
  });

  it('omits a section that would be empty', () => {
    render(<ExerciseRelationships exercises={[entry('a', 'Nur eine', 'alternative')]} />);

    expect(screen.getByRole('region', { name: 'Alternativen' })).toBeVisible();
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('renders nothing at all when there are no relationships', () => {
    const { container } = render(<ExerciseRelationships exercises={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('names the related group once, through its disclosure', () => {
    render(
      <ExerciseRelationships
        exercises={[entry('a', 'Erste', 'alternative'), entry('b', 'Zweite', 'related')]}
      />,
    );

    // One mention, not a summary plus a screen-reader-only heading.
    expect(screen.getAllByText(/Verwandte Übungen/)).toHaveLength(1);
  });

  it('shows only what it was given, never a derived connection', () => {
    render(
      <ExerciseRelationships
        exercises={[entry('a', 'Erste', 'alternative'), entry('b', 'Zweite', 'alternative')]}
      />,
    );

    // Two in, two out — no transitive third.
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});
