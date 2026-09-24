import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StoredVideoRemoval } from './stored-video-removal';

/**
 * Deleting a stored video after its analysis (§18).
 *
 * The failure this pins: the offer appeared the moment an analysis finished,
 * promising that the analysis was stored. It was not, a coach deleted the video
 * on that promise, and the analysis they had not yet read was gone. So the
 * offer must wait for the analysis to be saved, and until then the screen has
 * to say plainly that nothing is kept yet.
 */

describe('before the analysis is saved', () => {
  it('offers no deletion at all', () => {
    const remove = vi.fn(() => Promise.resolve({}));
    render(<StoredVideoRemoval saved={false} remove={remove} />);

    expect(screen.queryByRole('button', { name: 'Video löschen' })).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it('says that the analysis is not yet kept, and what to do', () => {
    render(<StoredVideoRemoval saved={false} remove={vi.fn()} />);

    const said = screen.getByRole('status').textContent ?? '';
    expect(said).toMatch(/noch nicht gespeichert/u);
    expect(said).toMatch(/verloren/u);
    // And nothing claiming the opposite, which is the sentence that misled.
    expect(said).not.toMatch(/ist gespeichert/u);
  });
});

describe('once the analysis is saved', () => {
  it('offers the deletion as soon as saving is reported', () => {
    const remove = vi.fn(() => Promise.resolve({}));
    const { rerender } = render(<StoredVideoRemoval saved={false} remove={remove} />);

    rerender(<StoredVideoRemoval saved remove={remove} />);

    expect(screen.getByRole('button', { name: 'Video löschen' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Video löschen?' }).textContent).toMatch(
      /ist gespeichert und bleibt erhalten/u,
    );
  });

  it('deletes only when asked, and confirms that the analysis stays', async () => {
    const user = userEvent.setup();
    const remove = vi.fn(() => Promise.resolve({}));
    render(<StoredVideoRemoval saved remove={remove} />);

    await user.click(screen.getByRole('button', { name: 'Video löschen' }));

    expect(remove).toHaveBeenCalledTimes(1);
    expect((await screen.findByRole('status')).textContent).toMatch(
      /Video wurde gelöscht.*Auswertung.*bleiben erhalten/u,
    );
  });

  it('keeps the offer and says why when the deletion is refused', async () => {
    const user = userEvent.setup();
    const remove = vi.fn(() => Promise.resolve({ message: 'Eine Analyse arbeitet noch damit.' }));
    render(<StoredVideoRemoval saved remove={remove} />);

    await user.click(screen.getByRole('button', { name: 'Video löschen' }));

    expect((await screen.findByRole('alert')).textContent).toContain('arbeitet noch');
    expect(screen.getByRole('button', { name: 'Video löschen' })).toBeVisible();
  });

  it('keeps the video when the coach says so', async () => {
    const user = userEvent.setup();
    const remove = vi.fn(() => Promise.resolve({}));
    render(<StoredVideoRemoval saved remove={remove} />);

    await user.click(screen.getByRole('button', { name: 'Video behalten' }));

    expect(screen.queryByRole('button', { name: 'Video löschen' })).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });
});
