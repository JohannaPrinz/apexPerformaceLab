import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Proof that the component-test harness works, and a worked example of what a
 * good test in it looks like.
 *
 * The component here is deliberately trivial and lives in the test file: this
 * proves the *harness*, not a feature, and inventing a production component to
 * demonstrate tooling would leave a file nobody asked for.
 *
 * ## What a good test asserts here
 *
 * Queries go through **role and accessible name**, not through class names or
 * test ids. Two reasons, in this order:
 *
 * 1. A test that finds a button by its role and label fails when the button
 *    stops being reachable — which is the failure a coach would hit. A test
 *    that finds `.btn-primary` passes happily while the control is invisible.
 * 2. It keeps the markup free to change. Renaming a class should not break a
 *    test; removing a label should.
 *
 * Interaction goes through `user-event` rather than `fireEvent`: it dispatches
 * the same sequence a browser does — focus, keydown, keyup, click — so a
 * control that only responds to one of them is caught here rather than in
 * someone's hands.
 */

function EmptyState({ query, onReset }: { query: string; onReset: () => void }) {
  return (
    <section aria-labelledby="empty-heading">
      <h2 id="empty-heading">Keine Übung gefunden</h2>
      <p>
        Für <strong>{query}</strong> gibt es keinen Treffer.
      </p>
      <button type="button" onClick={onReset}>
        Filter zurücksetzen
      </button>
    </section>
  );
}

describe('the component test harness', () => {
  it('renders a component into a DOM and finds it the way a user would', () => {
    render(<EmptyState query="Kniebeuge" onReset={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Keine Übung gefunden' })).toBeVisible();
    expect(screen.getByText('Kniebeuge')).toBeVisible();
  });

  it('provides the jest-dom matchers', () => {
    render(<EmptyState query="Kniebeuge" onReset={() => undefined} />);

    // `toBeVisible` and `toHaveAccessibleName` come from jest-dom; without the
    // setup import they would be undefined rather than failing informatively.
    expect(screen.getByRole('button')).toHaveAccessibleName('Filter zurücksetzen');
  });

  it('dispatches a real interaction sequence', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();

    render(<EmptyState query="Kniebeuge" onReset={onReset} />);
    await user.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));

    expect(onReset).toHaveBeenCalledOnce();
  });

  it('starts each test with an empty document', () => {
    // Proves the `cleanup` in vitest.setup.ts: without it this render would be
    // the fourth in the same document and the query below would find several.
    render(<EmptyState query="Bankdrücken" onReset={() => undefined} />);

    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });
});
