import Link from 'next/link';

import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';
import { SignOutButton } from '@/features/auth';

/**
 * The personal level — deliberately not the workspace shell.
 *
 * This is the whole mechanism by which the two levels stay distinguishable: a
 * page here has no sidebar, no Athletes and no Exercises, because none of those
 * exist outside a workspace. A coach can see at a glance which level they are
 * on, without a label telling them.
 *
 * Its own route group rather than a variant of `(app)`: route groups are how
 * Next expresses "these pages share a frame", and giving the personal level its
 * own frame is cheaper than branching the workspace one on every page.
 */
export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        {/* `TOUCH_TARGET`: the wordmark is the way home and was 20px tall. */}
        <Link
          href="/start"
          className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex items-center rounded px-2 text-sm font-semibold`}
        >
          Apex OS
        </Link>

        <SignOutButton />
      </header>

      {children}
    </div>
  );
}
