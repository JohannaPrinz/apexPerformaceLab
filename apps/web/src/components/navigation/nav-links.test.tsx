import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NavLinks, isActive } from './nav-links';

/**
 * The navigation has exactly one piece of logic — which item is the current
 * one — and that is what these assert. Everything else about it is markup.
 */

const mocks = vi.hoisted(() => ({ pathname: '/dashboard' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

const render_ = (pathname: string) => {
  mocks.pathname = pathname;

  return render(<NavLinks />);
};

describe('deciding which item is current', () => {
  it('matches the route itself', () => {
    expect(isActive('/athletes', '/athletes')).toBe(true);
  });

  it('keeps the section lit on a detail page', () => {
    // Marking a detail page as "nowhere" is the commonest way navigation loses
    // a reader: they open an athlete and the sidebar goes blank.
    expect(isActive('/athletes/ath_1', '/athletes')).toBe(true);
    expect(isActive('/athletes/ath_1/edit', '/athletes')).toBe(true);
  });

  it('only matches on a segment boundary', () => {
    // A prefix match without this would light "Athleten" on an unrelated route
    // that merely starts with the same letters.
    expect(isActive('/athletes-archive', '/athletes')).toBe(false);
  });

  it('does not match a different section', () => {
    expect(isActive('/exercises', '/athletes')).toBe(false);
  });
});

describe('the navigation', () => {
  it('offers the three workspace areas, in German', () => {
    render_('/dashboard');

    expect(screen.getByRole('link', { name: 'Übersicht' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Athleten' })).toHaveAttribute('href', '/athletes');
    expect(screen.getByRole('link', { name: 'Übungen' })).toHaveAttribute('href', '/exercises');
  });

  it('leaves assessments out, because they belong to an athlete', () => {
    // §3: Athlete → Performance Case → Assessment. A top-level entry would
    // promise a workspace-wide list that does not exist.
    render_('/dashboard');

    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByRole('link', { name: /Assessment/i })).toBeNull();
  });

  it('announces the current page, not only colours it', () => {
    render_('/athletes/ath_1');

    expect(screen.getByRole('link', { name: 'Athleten' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Übungen' })).not.toHaveAttribute('aria-current');
  });

  it('marks exactly one item at a time', () => {
    render_('/exercises/ex_1');

    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName('Übungen');
  });
});
