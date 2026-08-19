'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Dumbbell, LayoutDashboard, Users } from 'lucide-react';

import { cn } from '@apex/ui';

/**
 * The main navigation, defined once and rendered in both layouts.
 *
 * Two parallel lists — one for the sidebar, one for the phone menu — is the
 * shape that drifted within a day in the exercise filter bar, and left a phone
 * with no filters at all. One definition, two placements.
 *
 * **No item triggers a query.** The active state comes from `usePathname`,
 * which is why this is a client component; everything it needs to render is in
 * the URL.
 *
 * Assessments are deliberately absent. An Assessment belongs to an Athlete
 * (§3: `Athlete → Performance Case → Assessment`), so it is reached through the
 * athlete's record — a top-level entry would suggest a list that does not exist.
 */

const ITEMS = [
  { href: '/dashboard', label: 'Übersicht', icon: LayoutDashboard },
  { href: '/athletes', label: 'Athleten', icon: Users },
  { href: '/exercises', label: 'Übungen', icon: Dumbbell },
] as const;

/**
 * Whether a route is the one being viewed.
 *
 * A prefix match, but only on a segment boundary: `/athletes/ath_1` keeps
 * "Athleten" lit, while a hypothetical `/athletes-archive` would not. Marking a
 * detail page as "nowhere" is the commonest way navigation loses a reader.
 */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ onNavigate }: { readonly onNavigate?: (() => void) | undefined }) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              // `aria-current` is the part a screen reader announces; the colour
              // is only how it looks. Both are needed — neither substitutes.
              aria-current={active ? 'page' : undefined}
              className={cn(
                // `min-h-11` is ~44px: the touch target guidance, applied on
                // every viewport rather than only the small one.
                'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                active
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
