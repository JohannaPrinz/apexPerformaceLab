import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DuplicateWarning } from './duplicate-warning';

/**
 * The warning has one job: give a coach enough to decide, and never decide for
 * them (§7).
 */

const candidate = (
  over: Partial<Parameters<typeof DuplicateWarning>[0]['candidates'][number]> = {},
) => ({
  id: 'ath_existing',
  firstName: 'Johanna',
  lastName: 'Prinz',
  dateOfBirth: '1994-03-17',
  email: 'johanna@example.org',
  archived: false,
  reason: 'name_and_birthdate' as const,
  ...over,
});

describe('the duplicate warning', () => {
  it('says plainly that nothing was saved', () => {
    // The coach pressed a button expecting a new athlete. If the warning does
    // not say the creation did not happen, they will assume it did.
    render(<DuplicateWarning candidates={[candidate()]} />);

    expect(screen.getByText(/noch nichts gespeichert/i)).toBeVisible();
  });

  it('interrupts, rather than sitting quietly on the page', () => {
    render(<DuplicateWarning candidates={[candidate()]} />);

    expect(screen.getByRole('alert')).toBeVisible();
  });

  it('names why each candidate matched', () => {
    render(
      <DuplicateWarning
        candidates={[
          candidate({ id: 'a', reason: 'email' }),
          candidate({ id: 'b', reason: 'name' }),
        ]}
      />,
    );

    expect(screen.getByText(/Gleiche E-Mail-Adresse/)).toBeVisible();
    expect(screen.getByText(/Gleicher Name ·/)).toBeVisible();
  });

  it('marks an archived candidate, which is the one nobody would find', () => {
    // An archived athlete is hidden from the roster by default, so re-entering
    // them is the commonest duplicate — and the warning is the only place the
    // coach would see them.
    render(<DuplicateWarning candidates={[candidate({ archived: true })]} />);

    expect(screen.getByText('Deaktiviert')).toBeVisible();
  });

  it('shows a German date and says so when there is none', () => {
    render(
      <DuplicateWarning
        candidates={[
          candidate({ id: 'a' }),
          candidate({ id: 'b', dateOfBirth: null, reason: 'name' }),
        ]}
      />,
    );

    expect(screen.getByText(/17\.3\.1994|17\.03\.1994/)).toBeVisible();
    expect(screen.getByText(/kein Geburtsdatum/)).toBeVisible();
  });

  it('opens a candidate in a new tab so the typed form survives', () => {
    render(<DuplicateWarning candidates={[candidate()]} />);

    const link = screen.getByRole('link', { name: /Prinz, Johanna/ });

    expect(link).toHaveAttribute('href', '/athletes/ath_existing');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('offers to go ahead, carrying the confirmation on the button itself', () => {
    // A submit button contributes its name and value to `FormData` only when it
    // is the button that submitted — so there is no hidden field to leave
    // behind, and the confirmation cannot be sent on the first attempt.
    render(<DuplicateWarning candidates={[candidate()]} />);

    const confirm = screen.getByRole('button', { name: 'Trotzdem neu anlegen' });

    expect(confirm).toHaveAttribute('type', 'submit');
    expect(confirm).toHaveAttribute('name', 'confirmDuplicate');
    expect(confirm).toHaveAttribute('value', '1');
  });

  it('counts the candidates in the heading', () => {
    render(<DuplicateWarning candidates={[candidate({ id: 'a' }), candidate({ id: 'b' })]} />);

    expect(screen.getByRole('heading')).toHaveTextContent('2 ähnliche Athleten');
    expect(within(screen.getByRole('alert')).getAllByRole('link')).toHaveLength(2);
  });
});
