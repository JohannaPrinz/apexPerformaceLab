import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadMoreAthletes } from './load-more-athletes';

/**
 * Cursor navigation, which only exists if the cursor actually reaches the URL.
 *
 * The roster discarded `nextCursor` before this component existed, so an athlete
 * past the twenty-fifth was unreachable — a list that quietly ends is worse than
 * one that says it has ended.
 */

const params = (init: Record<string, string> = {}): URLSearchParams => new URLSearchParams(init);

const loadMore = () => screen.queryByRole('link', { name: 'Weitere Athleten laden' });

describe('loading further athletes', () => {
  it('links to the next page carrying the cursor', () => {
    render(<LoadMoreAthletes nextCursor="ath_25" query={params()} />);

    expect(loadMore()).toHaveAttribute('href', '/athletes?cursor=ath_25');
  });

  it('keeps the search and the archive filter across the jump', () => {
    render(<LoadMoreAthletes nextCursor="ath_25" query={params({ q: 'Prinz', archived: '1' })} />);

    const href = loadMore()?.getAttribute('href') ?? '';

    expect(href).toContain('q=Prinz');
    expect(href).toContain('archived=1');
    expect(href).toContain('cursor=ath_25');
  });

  it('replaces an earlier cursor rather than appending a second one', () => {
    render(<LoadMoreAthletes nextCursor="ath_50" query={params({ cursor: 'ath_25' })} />);

    const href = loadMore()?.getAttribute('href') ?? '';

    expect(new URLSearchParams(href.split('?')[1]).getAll('cursor')).toEqual(['ath_50']);
  });

  it('offers nothing on the last page when it is also the first', () => {
    // nextCursor is null exactly when the service found no further row.
    const { container } = render(<LoadMoreAthletes nextCursor={null} query={params()} />);

    expect(container).toBeEmptyDOMElement();
    expect(loadMore()).toBeNull();
  });

  it('still offers the way home on the last page of several', () => {
    render(<LoadMoreAthletes nextCursor={null} query={params({ cursor: 'ath_50', q: 'Prinz' })} />);

    expect(loadMore()).toBeNull();
    expect(screen.getByRole('link', { name: 'Zum Anfang' })).toHaveAttribute(
      'href',
      '/athletes?q=Prinz',
    );
  });
});
