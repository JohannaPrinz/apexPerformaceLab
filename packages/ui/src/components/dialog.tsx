'use client';

import * as React from 'react';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { cn } from '../lib/cn';

/**
 * A modal dialog.
 *
 * ## Built on Radix, not by hand
 *
 * `radix-ui` is already a dependency of this package, and a correct dialog is
 * mostly the parts that are easy to get subtly wrong: a focus trap, returning
 * focus to whatever opened it, `aria-modal` with the rest of the page made
 * inert, Escape, and locking body scroll without the page jumping as the
 * scrollbar disappears. Writing those again would be a worse dialog and more
 * code — this file supplies the design, not the behaviour.
 *
 * ## What the design adds
 *
 * **Nearly full-bleed on a phone, capped on a desktop.** A centred 500px card
 * on a 375px screen leaves 20px gutters and a cramped form; below `sm` the
 * dialog takes the width it needs and sits against the bottom, where a thumb
 * is.
 *
 * **The content scrolls, not the page.** A long form inside a dialog that grows
 * past the viewport otherwise scrolls the document behind it. The header stays
 * put and the footer sticks to the bottom of the scrolling area, so the primary
 * action never scrolls out of reach — measured on a phone, it did.
 *
 * ## Using it
 *
 * ```tsx
 * <Dialog open={open} onOpenChange={setOpen}>
 *   <DialogContent title="Athlet anlegen" description="Nur der Name ist nötig.">
 *     …
 *     <DialogFooter>…</DialogFooter>
 *   </DialogContent>
 * </Dialog>
 * ```
 *
 * `title` is a prop rather than a slot because Radix requires a title for the
 * accessible name, and a dialog that forgets one is a dialog a screen reader
 * announces as nothing at all.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  /** The accessible name. Required — Radix warns without one, and rightly. */
  title: string;
  /** One sentence of context, read out after the title. */
  description?: string;
  /** Hides the corner close button where the footer already offers a way out. */
  hideClose?: boolean;
}

export function DialogContent({
  title,
  description,
  hideClose = false,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />

      <DialogPrimitive.Content
        className={cn(
          // Bottom-anchored and nearly full width on a phone; a centred card
          // from `sm`. `max-h` with `flex-col` is what keeps the body scrolling
          // instead of the document.
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col gap-4 rounded-t-xl border border-border bg-card p-5 shadow-lg',
          'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[85dvh] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
          className,
        )}
        {...props}
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <DialogPrimitive.Title className="text-lg font-semibold break-words">
              {title}
            </DialogPrimitive.Title>

            {description === undefined ? null : (
              <DialogPrimitive.Description className="text-sm text-pretty text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>

          {hideClose ? null : (
            <DialogPrimitive.Close
              // 44px, like every other control: a close button is the one a
              // thumb reaches for first when a dialog opens by accident.
              className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Schließen"
            >
              <X aria-hidden="true" className="size-5" />
            </DialogPrimitive.Close>
          )}
        </header>

        {/* `min-h-0` is what lets this shrink inside the flex column — without
            it the body refuses to scroll and pushes the footer off-screen. */}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/**
 * The action row.
 *
 * Reversed on a phone: the primary action sits at the bottom, closest to the
 * thumb, and reads last. On a desktop it returns to the right, where a pointer
 * expects it.
 */
export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        // `sticky` inside the scrolling body: the actions stay at the bottom
        // edge while a long form moves behind them. On a phone the primary
        // action would otherwise sit below the fold of a dialog that is already
        // the height of the screen.
        'sticky bottom-0 -mx-1 flex flex-col-reverse gap-2 border-t border-border bg-card px-1 pt-4 pb-1 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}
