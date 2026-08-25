import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AthleteForm } from './athlete-form';

/**
 * One form, two modes.
 *
 * The assertions go through label text and accessible names rather than markup:
 * a coach reaches these fields by their labels, and a test that found them by
 * class name would keep passing after the label disappeared.
 *
 * The Server Actions are stubbed because they run on the server and would pull a
 * tRPC client into jsdom. What is being tested here is what the form renders and
 * what it sends — the authorization behind it is asserted in `service.test.ts`,
 * where it actually lives.
 */

/**
 * `vi.mock` is hoisted above the imports, so the stubs have to be created inside
 * `vi.hoisted` — a plain top-level `const` is not initialised yet when the
 * factory runs.
 *
 * `bind` is stubbed rather than left to the real Function.prototype because the
 * bound athlete id is the thing under test: it must reach the action without
 * ever being rendered as a field.
 */
const mocks = vi.hoisted(() => {
  const bound: { athleteId?: string } = {};
  const create = (): Record<string, never> => ({});
  const update = (): Record<string, never> => ({});

  return {
    bound,
    create: Object.assign(create, { bind: () => create }),
    update: Object.assign(update, {
      bind: (_thisArg: unknown, athleteId: string) => {
        bound.athleteId = athleteId;

        return update;
      },
    }),
  };
});

vi.mock('../server/actions', () => ({
  createAthleteAction: mocks.create,
  updateAthleteAction: mocks.update,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const ATHLETE = {
  id: 'ath_1',
  firstName: 'Johanna',
  lastName: 'Prinz',
  dateOfBirth: new Date('1994-03-17T00:00:00.000Z'),
  sex: 'female' as const,
  email: 'johanna@example.org',
  phone: '+49 30 123456',
  heightCm: 178,
  weightKg: 64.5,
};

const fieldNames = (): (string | null)[] => {
  const form = screen.getByRole('form', { name: 'Athletenstammdaten' });

  return [...form.querySelectorAll('[name]')].map((field) => field.getAttribute('name'));
};

describe('creating an athlete', () => {
  it('offers every master-data field', () => {
    render(<AthleteForm />);

    expect(fieldNames()).toEqual([
      'firstName',
      'lastName',
      'dateOfBirth',
      // Beside the date of birth, because the two are read together: both are
      // there so a body-fat percentage can be calculated at all.
      'sex',
      'email',
      'phone',
      'heightCm',
      'weightKg',
    ]);
  });

  it('labels the fields in German and names the units', () => {
    render(<AthleteForm />);

    expect(screen.getByLabelText(/^Vorname/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nachname/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Geburtsdatum/)).toBeInTheDocument();
    // The unit is in the label because the column has no room to carry one.
    expect(screen.getByLabelText(/^Größe in cm/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Aktuelles Gewicht in kg/)).toBeInTheDocument();
  });

  it('starts empty and offers to create', () => {
    render(<AthleteForm />);

    expect(screen.getByLabelText(/^Vorname/)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Athlet anlegen' })).toBeVisible();
  });

  it('requires both names and nothing else', () => {
    render(<AthleteForm />);

    expect(screen.getByLabelText(/^Vorname/)).toBeRequired();
    expect(screen.getByLabelText(/^Nachname/)).toBeRequired();
    expect(screen.getByLabelText(/^E-Mail/)).not.toBeRequired();
    expect(screen.getByLabelText(/^Aktuelles Gewicht in kg/)).not.toBeRequired();
  });

  it('accepts a decimal comma, which type=number would refuse', () => {
    // A number input rejects 64,5 in several browsers before the value ever
    // reaches the schema, and the comma is the ordinary German input.
    render(<AthleteForm />);

    const weight = screen.getByLabelText(/^Aktuelles Gewicht in kg/);

    expect(weight).toHaveAttribute('inputmode', 'decimal');
    expect(weight).not.toHaveAttribute('type', 'number');
  });
});

describe('editing an athlete', () => {
  it('prefills every stored value', () => {
    render(<AthleteForm athlete={ATHLETE} />);

    expect(screen.getByLabelText(/^Vorname/)).toHaveValue('Johanna');
    expect(screen.getByLabelText(/^Nachname/)).toHaveValue('Prinz');
    expect(screen.getByLabelText(/^Geburtsdatum/)).toHaveValue('1994-03-17');
    expect(screen.getByLabelText(/^E-Mail/)).toHaveValue('johanna@example.org');
    expect(screen.getByLabelText(/^Telefon/)).toHaveValue('+49 30 123456');
  });

  it('shows a figure the way it would be typed back', () => {
    render(<AthleteForm athlete={ATHLETE} />);

    expect(screen.getByLabelText(/^Größe in cm/)).toHaveValue('178');
    expect(screen.getByLabelText(/^Aktuelles Gewicht in kg/)).toHaveValue('64,5');
  });

  it('leaves an unset figure empty rather than showing a zero', () => {
    render(<AthleteForm athlete={{ ...ATHLETE, heightCm: null, weightKg: null }} />);

    expect(screen.getByLabelText(/^Größe in cm/)).toHaveValue('');
    expect(screen.getByLabelText(/^Aktuelles Gewicht in kg/)).toHaveValue('');
  });

  it('binds the athlete id to the action instead of rendering it', () => {
    // A hidden id field would let the browser name the record to write. The
    // tenant filter still stands behind it, but the cheapest place to not have
    // the problem is here.
    render(<AthleteForm athlete={ATHLETE} />);

    expect(fieldNames()).not.toContain('athleteId');
    expect(mocks.bound.athleteId).toBe('ath_1');
  });

  it('says it saves changes, and explains what an emptied field does', () => {
    render(<AthleteForm athlete={ATHLETE} />);

    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeVisible();
    expect(screen.getByText(/leeres Feld entfernt den gespeicherten Wert/)).toBeVisible();
  });
});

/**
 * The one field that exists for a calculation rather than for a profile.
 *
 * A body-density equation is fitted per sex, so leaving this unanswered has a
 * consequence — and the form has to say which, rather than letting a coach
 * discover it as a missing number weeks later.
 */
describe('the sex field', () => {
  it('offers the three the product knows, in German', () => {
    render(<AthleteForm />);

    const field = screen.getByLabelText('Geschlecht');

    expect([...(field as HTMLSelectElement).options].map((option) => option.textContent)).toEqual([
      'Männlich',
      'Weiblich',
      'Keine Angabe',
    ]);
  });

  it('starts unstated for a new athlete', () => {
    // Not male-by-default: an athlete nobody has been asked about is unstated,
    // and a pre-selected sex would be an answer the coach never gave.
    render(<AthleteForm />);

    expect(screen.getByLabelText('Geschlecht')).toHaveValue('not_specified');
  });

  it('prefills what was stored', () => {
    render(<AthleteForm athlete={ATHLETE} />);

    expect(screen.getByLabelText('Geschlecht')).toHaveValue('female');
  });

  it('says why it is asked and what happens without it', () => {
    render(<AthleteForm />);

    expect(screen.getByText(/Körperfettberechnung/)).toBeVisible();
    expect(screen.getByText(/kein Körperfettanteil berechnet/)).toBeVisible();
  });

  it('submits under the name the schema reads', () => {
    render(<AthleteForm />);

    expect(fieldNames()).toContain('sex');
  });

  it('says nothing about the athlete beyond the calculation', () => {
    // No identity claim, no gender wording: the field is here for an equation.
    render(<AthleteForm />);

    const text = document.body.textContent ?? '';

    for (const word of ['Identität', 'divers', 'Gender']) {
      expect(text, word).not.toContain(word);
    }
  });
});
