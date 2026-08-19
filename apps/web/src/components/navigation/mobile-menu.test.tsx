import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MobileMenu } from './mobile-menu';

/**
 * The phone menu is the only way to reach anything below `lg`, so the things
 * asserted here are the ones that would strand a coach: it opens, it holds all
 * three areas and the sign-out, and it can be dismissed without a pointer.
 */

const mocks = vi.hoisted(() => ({ pathname: '/dashboard' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@apex/auth/client', () => ({ signOut: () => Promise.resolve() }));

const toggle = () => screen.getByRole('button', { name: /Menü/ });

describe('the menu below lg', () => {
  it('starts closed, and says so', () => {
    render(<MobileMenu coachName="Johanna Prinz" />);

    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('holds no focusable link while closed', () => {
    // A hidden panel that still contains links is a trap for anyone tabbing
    // through the page.
    render(<MobileMenu coachName="Johanna Prinz" />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('opens every workspace area', async () => {
    const user = userEvent.setup();
    render(<MobileMenu coachName="Johanna Prinz" />);

    await user.click(toggle());

    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Übersicht' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Athleten' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Übungen' })).toBeVisible();
  });

  it('reaches sign-out, which otherwise exists only in the sidebar', async () => {
    const user = userEvent.setup();
    render(<MobileMenu coachName="Johanna Prinz" />);

    await user.click(toggle());

    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeVisible();
    expect(screen.getByText('Johanna Prinz')).toBeVisible();
  });

  it('closes on Escape, so a keyboard is enough to get out', async () => {
    const user = userEvent.setup();
    render(<MobileMenu coachName="Johanna Prinz" />);

    await user.click(toggle());
    await user.keyboard('{Escape}');

    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('wires the button to the panel it controls', async () => {
    const user = userEvent.setup();
    render(<MobileMenu coachName="Johanna Prinz" />);

    await user.click(toggle());

    const controls = toggle().getAttribute('aria-controls');

    expect(controls).toBeTruthy();
    expect(document.getElementById(controls ?? '')).not.toBeNull();
  });

  it('falls back to a neutral word when the coach has no display name', async () => {
    const user = userEvent.setup();
    render(<MobileMenu coachName={null} />);

    await user.click(toggle());

    expect(screen.getByText('Coach')).toBeVisible();
  });
});
