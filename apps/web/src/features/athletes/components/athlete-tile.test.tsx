import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AthleteTile } from './athlete-tile';

/**
 * The tile is a shortcut into a record, so what matters is that it leads to the
 * right one and shows only figures that have a query behind them.
 */

const athlete = (over: Partial<Parameters<typeof AthleteTile>[0]['athlete']> = {}) => ({
  id: 'ath_1',
  firstName: 'Johanna',
  lastName: 'Prinz',
  createdAt: new Date('2026-03-17T00:00:00.000Z'),
  assessmentCount: 3,
  ...over,
});

describe('the athlete tile', () => {
  it('leads to that athlete and no other', () => {
    render(<AthleteTile athlete={athlete({ id: 'ath_42' })} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/athletes/ath_42');
  });

  it('makes the whole card the target, not just the name', () => {
    // On a phone that is the difference between a comfortable tap and a careful
    // one — the link is the card, so there is exactly one.
    render(<AthleteTile athlete={athlete()} />);

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveAccessibleName(/Prinz/);
  });

  it('shows the name and the date the record was created', () => {
    render(<AthleteTile athlete={athlete()} />);

    expect(screen.getByText('Johanna Prinz')).toBeVisible();
    expect(screen.getByText(/17\.3\.2026|17\.03\.2026/)).toBeVisible();
  });

  it('counts assessments, in the singular where that is right', () => {
    render(<AthleteTile athlete={athlete({ assessmentCount: 1 })} />);

    expect(screen.getByText('1 Assessment')).toBeVisible();
  });

  it('omits the count entirely when there is nothing to count', () => {
    // Not "0 Assessments": a tile full of zeroes reads as a broken screen.
    render(<AthleteTile athlete={athlete({ assessmentCount: 0 })} />);

    expect(screen.queryByText(/Assessment/)).toBeNull();
  });

  it('shows no figure that has no query behind it', () => {
    // Uploads, comments and share status are modelled but have no service.
    // They are absent rather than empty, and this keeps them that way.
    render(<AthleteTile athlete={athlete()} />);

    const text = document.body.textContent ?? '';

    for (const word of ['Upload', 'Kommentar', 'Shared', 'Aktivität', 'Termin']) {
      expect(text).not.toContain(word);
    }
  });
});
