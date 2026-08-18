'use client';

import { useEffect } from 'react';

import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Moves the focus to the result line after a search or a filter change.
 *
 * The list is a server component and a filter change is a full navigation, so
 * the focus lands back at the top of the document. A keyboard user then walks
 * the entire filter bar again to reach the results they just asked for.
 *
 * Deliberately narrow:
 *
 * - Only when something is narrowed. A first visit to the plain catalogue is
 *   not the result of an action, and stealing focus there would be rude.
 * - Onto the result line, which is the live region and not interactive. Focus
 *   on a link or a heading inside the list would imply the wrong next step.
 * - `aria-live` stays. The two do different jobs: the announcement tells a
 *   screen-reader user *what* changed, the focus tells the keyboard *where* it
 *   now is.
 */
export function FocusResults({ active }: { readonly active: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const key = params.toString();

  useEffect(() => {
    if (!active) return;

    document.getElementById('exercise-results')?.focus();
  }, [active, pathname, key]);

  return null;
}
