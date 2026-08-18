import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExerciseDetail } from './exercise-detail';

const base = {
  name: 'Kniebeuge mit Langhantel',
  canonicalName: 'Barbell Squat',
  description: 'Die Kniebeuge mit der Langhantel im Nacken.',
  instructions: ['Stange aufnehmen.', 'Absenken.', 'Aufrichten.'],
  category: 'strength',
  difficulty: 'beginner',
  forceType: 'push',
  mechanic: 'compound',
  unilateral: false,
  primaryMuscles: ['quads'],
  secondaryMuscles: ['glutes', 'hamstrings'],
  equipment: ['barbell'],
  media: [],
};

describe('the exercise detail', () => {
  it('shows the German name, the description and every instruction step', () => {
    render(<ExerciseDetail exercise={base} />);

    expect(screen.getByRole('heading', { name: 'Kniebeuge mit Langhantel' })).toBeVisible();
    expect(screen.getByText('Die Kniebeuge mit der Langhantel im Nacken.')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('translates every vocabulary into German', () => {
    render(<ExerciseDetail exercise={base} />);

    expect(screen.getByText('Kraft')).toBeVisible();
    expect(screen.getByText('Einsteiger')).toBeVisible();
    expect(screen.getByText('Oberschenkelvorderseite')).toBeVisible();
    expect(screen.getByText('Gesäß, Beinrückseite')).toBeVisible();
    expect(screen.getByText('Langhantel')).toBeVisible();
    expect(screen.getByText('Drücken')).toBeVisible();
    expect(screen.getByText('Mehrgelenkig')).toBeVisible();
    expect(screen.getByText('Beidseitig')).toBeVisible();
  });

  it('shows the English name beside the German one', () => {
    render(<ExerciseDetail exercise={base} />);

    expect(screen.getByTestId('canonical-name')).toHaveTextContent('Barbell Squat');
  });

  it('omits the English name when it says nothing new', () => {
    render(<ExerciseDetail exercise={{ ...base, name: 'Burpee', canonicalName: 'Burpee' }} />);

    expect(screen.queryByTestId('canonical-name')).toBeNull();
  });

  it('shows the placeholder and says so when there is no media', () => {
    render(<ExerciseDetail exercise={base} />);

    expect(screen.getByTestId('thumbnail-placeholder')).toBeVisible();
    expect(screen.getByText(/kein Bild und kein Video/)).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders a valid image when one exists', () => {
    render(
      <ExerciseDetail
        exercise={{
          ...base,
          media: [{ kind: 'image', url: 'https://example.test/squat.jpg', alt: 'Tiefe Hocke' }],
        }}
      />,
    );

    expect(screen.getByRole('img', { name: 'Tiefe Hocke' })).toBeVisible();
  });

  it('calls bodyweight by its name rather than showing an empty field', () => {
    render(<ExerciseDetail exercise={{ ...base, equipment: [] }} />);

    expect(screen.getByText('Körpergewicht')).toBeVisible();
  });

  it('leaves out an attribute the catalogue does not carry', () => {
    render(<ExerciseDetail exercise={{ ...base, forceType: null, mechanic: null }} />);

    expect(screen.queryByText('Kraftrichtung')).toBeNull();
    expect(screen.queryByText('Gelenkbeteiligung')).toBeNull();
  });
});
