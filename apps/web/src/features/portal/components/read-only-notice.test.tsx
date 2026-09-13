import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReadOnlyNotice } from './read-only-notice';

/**
 * What a deactivated athlete is told (§21).
 *
 * A deactivated account keeps the portal and loses the writes. The file shelf
 * used to remove its buttons without a word, which from the athlete's side
 * reads as a broken page rather than a decision somebody made.
 *
 * Two things are asserted: that the state is stated rather than implied, and
 * that it says what still *works* — the point of the read-only mode is that
 * everything is still there to look at and to download, and a notice that only
 * listed losses would misrepresent it.
 */

describe('the read-only notice', () => {
  it('names the state rather than leaving a missing button to explain it', () => {
    render(<ReadOnlyNotice>neue Einträge sind nicht mehr möglich.</ReadOnlyNotice>);

    expect(screen.getByRole('status').textContent).toMatch(/auf lesen gestellt/iu);
  });

  it('says what still works, not only what does not', () => {
    render(<ReadOnlyNotice>neue Einträge sind nicht mehr möglich.</ReadOnlyNotice>);

    const said = screen.getByRole('status').textContent ?? '';

    expect(said).toMatch(/sehen weiterhin alles/iu);
    expect(said).toMatch(/herunterladen/iu);
  });

  it('lets each surface name what it can no longer do', () => {
    // "Neue Einträge" means nothing on a page of files, so the closing clause
    // belongs to the caller.
    render(
      <ReadOnlyNotice>
        neue Dateien lassen sich nicht mehr ablegen, umbenennen oder löschen.
      </ReadOnlyNotice>,
    );

    expect(screen.getByRole('status').textContent).toMatch(/neue dateien/iu);
  });

  it('is announced, because it explains a control that is not there', () => {
    // A missing upload button gives a screen reader nothing to notice at all.
    render(<ReadOnlyNotice>neue Einträge sind nicht mehr möglich.</ReadOnlyNotice>);

    expect(screen.getByRole('status')).toBeTruthy();
  });
});
