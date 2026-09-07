import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { api } from '@/trpc/server';

/**
 * The athlete's shell (§21).
 *
 * ## Why it is not `AppShell`
 *
 * That shell is a workspace navigation: athletes, assessments, exercises,
 * reports, a workspace switcher. Every item of it is a coach's, and an athlete
 * has exactly one place to be — their own record. Reusing it and hiding items
 * would leave the hiding as the only thing between an athlete and a coach's
 * screen, and a hidden link is an affordance, not a boundary
 * (docs/SECURITY.md).
 *
 * So there is no navigation here at all: one surface, no way to ask for
 * another, and the header says whose practice it belongs to.
 *
 * The read is `portal.me`, which runs on `athleteProcedure` — a coach opening
 * `/portal` is refused by the procedure rather than shown an empty page.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await api.portal.me();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-content flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex min-w-0 flex-col">
            <span className="eyebrow">Athletenbereich</span>
            <p className="truncate text-sm text-muted-foreground">{me.organization.name}</p>
          </div>

          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-content flex-1 flex-col gap-10 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
