'use client';

import { useEffect, useId, useState } from 'react';

import { usePathname } from 'next/navigation';

import { Menu, X } from 'lucide-react';

import { SignOutButton } from '@/features/auth';

import { NavLinks } from './nav-links';

/**
 * The navigation on a phone and a portrait tablet.
 *
 * **A disclosure, not a modal drawer.** The design system has no Sheet, and the
 * project's established pattern for "hide this until asked" is a disclosure —
 * the exercise filter bar does exactly this. A drawer with a backdrop would
 * need a focus trap and an inert background to be honest about
 * `aria-modal="true"`, which is a lot of machinery for three links.
 *
 * So this is a button and a panel, wired by `aria-expanded` / `aria-controls`.
 * Keyboard users get the standard behaviour without anything custom, and there
 * is no focus trap to get subtly wrong.
 *
 * The panel closes when the route changes: without that, tapping a link leaves
 * the menu covering the page it just navigated to.
 */
export function MobileMenu({ coachName }: { readonly coachName: string | null }) {
  const pathname = usePathname();
  const panelId = useId();

  /**
   * The route the menu was opened on — which is also how it closes itself.
   *
   * Storing the route rather than a boolean makes "closed after navigating" a
   * derived value instead of an effect: the moment `pathname` changes, `open`
   * is false, with no render scheduled to make it so. An effect calling
   * `setOpen(false)` would work too, and would cost a second render pass every
   * time a link is followed.
   */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;

  const close = (): void => {
    setOpenedOn(null);
  };

  // Escape closes, which a disclosure does not get for free the way `<details>`
  // does — and a menu that can only be dismissed by pointing is a menu a
  // keyboard user is stuck in.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Menü schließen' : 'Menü öffnen'}
        onClick={() => {
          setOpenedOn(open ? null : pathname);
        }}
        className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {open ? (
          <X aria-hidden="true" className="size-5" />
        ) : (
          <Menu aria-hidden="true" className="size-5" />
        )}
      </button>

      {/* Rendered only when open: an `aria-hidden` panel that still holds
          focusable links is a trap for anyone tabbing through. */}
      {open ? (
        <div
          id={panelId}
          className="absolute inset-x-0 top-full z-40 flex flex-col gap-4 border-b border-border bg-background p-4 shadow-sm"
        >
          <nav aria-label="Hauptnavigation">
            <NavLinks onNavigate={close} />
          </nav>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <span className="truncate text-sm text-muted-foreground">{coachName ?? 'Coach'}</span>
            <SignOutButton />
          </div>
        </div>
      ) : null}
    </>
  );
}
