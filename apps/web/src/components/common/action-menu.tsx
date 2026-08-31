'use client';

import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@apex/ui';

import { FOCUS_RING, TOUCH_TARGET } from './touch';

/**
 * The actions a card offers, gathered in one place.
 *
 * ## Why the actions leave the body of the card
 *
 * A card is read, not filled in. Buttons scattered between its facts make every
 * card look like a small form and push the information — the name, the status,
 * the number that matters — into whatever space is left. So the body carries
 * information only, and everything a person can *do* sits in the header: the one
 * or two actions worth a click of their own, and the rest behind this.
 *
 * ## Why it is written here rather than pulled in
 *
 * It needs a trigger, a list, Escape, an outside click and a correct pair of
 * ARIA attributes — and nothing else. A menu primitive from a component library
 * would bring a popover engine, a portal and a focus trap for a list of at most
 * five links.
 *
 * It lives beside `touch.ts` for the same reason that file does: several slices
 * need it, and a slice importing another slice's shared control would be the
 * wrong kind of coupling.
 *
 * ## What it is not
 *
 * Not a place to hide a primary action. If a coach does the thing most times
 * they open the screen, it belongs beside this button rather than inside it.
 */

const DOTS = (
  <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="currentColor">
    <circle cx="8" cy="3" r="1.5" />
    <circle cx="8" cy="8" r="1.5" />
    <circle cx="8" cy="13" r="1.5" />
  </svg>
);

export function ActionMenu({
  label,
  children,
  icon,
  className,
}: {
  /** Named for screen readers — "Aktionen" alone repeats across a list. */
  readonly label: string;
  readonly children: ReactNode;
  /** The trigger's icon. Defaults to the three dots. */
  readonly icon?: ReactNode;
  readonly className?: string;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (container.current?.contains(target) === true) return;

      /**
       * A dialog opened *from* this menu renders in a portal, so every click
       * inside it lands outside the menu's own subtree. Closing here unmounted
       * the entry that owns the dialog, taking the dialog — and the action it
       * was about to run — with it. From the reader's side the press simply did
       * nothing.
       */
      if (target?.closest('[role="dialog"], [role="alertdialog"]') != null) return;

      setOpen(false);
    };

    // Escape closes and returns focus to the trigger, which is where a keyboard
    // user came from — leaving focus on a removed menu strands them at the top
    // of the document.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      container.current?.querySelector('button')?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className={cn(
          FOCUS_RING,
          TOUCH_TARGET,
          'inline-flex min-w-11 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:text-foreground lg:min-w-8',
        )}
      >
        {icon ?? DOTS}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          /* Deliberately does not close on activation. An entry may open a
             dialog, and unmounting the menu would take the dialog with it; an
             entry that mutates leaves the menu showing the new state, which is
             the clearest confirmation there is. Escape, an outside click and
             navigating away all still close it. */
          className="absolute right-0 z-20 mt-1 flex min-w-52 flex-col gap-0.5 rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

const ITEM_CLASSES =
  'flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground';

/**
 * One entry.
 *
 * `asChild` so a link stays a link: an action that navigates must be openable in
 * a new tab, and a button calling `router.push` cannot be.
 */
export function ActionMenuItem({
  children,
  asChild = false,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { readonly asChild?: boolean }) {
  const classes = cn(FOCUS_RING, ITEM_CLASSES, className);

  if (asChild && isValidElement<{ className?: string; role?: string }>(children)) {
    return cloneElement(children, {
      className: cn(classes, children.props.className),
      role: 'menuitem',
    });
  }

  return (
    <button type="button" role="menuitem" className={classes} {...props}>
      {children}
    </button>
  );
}
