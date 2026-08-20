import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@apex/ui';

/**
 * The behaviour a dialog is judged by is the behaviour that traps people when
 * it is wrong: it must be announced as a dialog, it must be dismissible from
 * the keyboard, and it must give focus back to whatever opened it.
 *
 * Radix supplies that behaviour; these tests pin that this component actually
 * uses it, and that the design layered on top has not broken the accessible
 * name or the close control.
 *
 * They live in the application rather than in `packages/ui`, which has no test
 * harness of its own. Standing one up for one component would be more
 * infrastructure than the component — and the application is its only consumer.
 */

function Example({ description }: { description?: string }) {
  return (
    <Dialog>
      <DialogTrigger>Öffnen</DialogTrigger>
      <DialogContent title="Athlet anlegen" {...(description === undefined ? {} : { description })}>
        <p>Inhalt</p>
        <label htmlFor="first">Vorname</label>
        <input id="first" />
        <DialogFooter>
          <button type="button">Abbrechen</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe('the dialog', () => {
  it('stays closed until it is asked for', () => {
    render(<Example />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens with an accessible name taken from the title', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole('button', { name: 'Öffnen' }));

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Athlet anlegen');
  });

  it('reads the description after the title when there is one', async () => {
    const user = userEvent.setup();
    render(<Example description="Nur der Name wird benötigt." />);

    await user.click(screen.getByRole('button', { name: 'Öffnen' }));

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Nur der Name wird benötigt.');
  });

  it('closes on Escape', async () => {
    // A dialog dismissible only by pointer is a dialog a keyboard user is stuck
    // in.
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole('button', { name: 'Öffnen' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('returns focus to whatever opened it', async () => {
    const user = userEvent.setup();
    render(<Example />);

    const trigger = screen.getByRole('button', { name: 'Öffnen' });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(trigger).toHaveFocus();
  });

  it('offers a labelled close control', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole('button', { name: 'Öffnen' }));
    await user.click(screen.getByRole('button', { name: 'Schließen' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('can hide the corner close where the footer already offers a way out', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Öffnen</DialogTrigger>
        <DialogContent title="Ohne Kreuz" hideClose>
          <p>Inhalt</p>
        </DialogContent>
      </Dialog>,
    );

    await user.click(screen.getByRole('button', { name: 'Öffnen' }));

    expect(screen.queryByRole('button', { name: 'Schließen' })).toBeNull();
  });

  it('keeps its content reachable from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole('button', { name: 'Öffnen' }));
    await user.tab();

    // Focus is inside the dialog rather than on the page behind it.
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });
});
