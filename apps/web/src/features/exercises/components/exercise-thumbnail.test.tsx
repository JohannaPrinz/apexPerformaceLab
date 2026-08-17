import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExerciseThumbnail } from './exercise-thumbnail';

/**
 * Every exercise in the catalogue has `media: []` today, so the placeholder is
 * the normal case. These tests hold it to looking deliberate — and hold the
 * component to never rendering an image it cannot trust.
 */

describe('the exercise preview', () => {
  it('shows a placeholder when there is no media at all', () => {
    render(<ExerciseThumbnail name="Kniebeuge mit Langhantel" media={[]} />);

    expect(screen.getByTestId('thumbnail-placeholder')).toHaveTextContent('K');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows a placeholder when media is absent entirely', () => {
    render(<ExerciseThumbnail name="Frontkniebeuge" />);

    expect(screen.getByTestId('thumbnail-placeholder')).toBeVisible();
  });

  /**
   * The wrkout paths are relative and the schema rejects them. A malformed value
   * must render the placeholder, not a broken-image icon.
   */
  it('shows a placeholder rather than a broken image for an unusable value', () => {
    render(
      <ExerciseThumbnail
        name="Ab Rollout mit Langhantel"
        media={[{ kind: 'image', url: 'Barbell_Ab_Rollout/0.jpg' }]}
      />,
    );

    expect(screen.getByTestId('thumbnail-placeholder')).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders a valid image when one exists', () => {
    render(
      <ExerciseThumbnail
        name="Kniebeuge"
        media={[{ kind: 'image', url: 'https://example.test/squat.jpg', alt: 'Tiefe Hocke' }]}
      />,
    );

    expect(screen.getByRole('img', { name: 'Tiefe Hocke' })).toHaveAttribute(
      'src',
      'https://example.test/squat.jpg',
    );
  });

  it('falls back to the exercise name when the image carries no alt text', () => {
    render(
      <ExerciseThumbnail
        name="Kniebeuge"
        media={[{ kind: 'image', url: 'https://example.test/squat.jpg' }]}
      />,
    );

    expect(screen.getByRole('img', { name: 'Kniebeuge' })).toBeVisible();
  });

  it('ignores a video, which needs a player rather than a thumbnail', () => {
    render(
      <ExerciseThumbnail
        name="Kniebeuge"
        media={[{ kind: 'video', url: 'https://example.test/squat.mp4' }]}
      />,
    );

    expect(screen.getByTestId('thumbnail-placeholder')).toBeVisible();
  });
});
