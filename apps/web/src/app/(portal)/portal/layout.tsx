import { TRPCError } from '@trpc/server';

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
 *
 * ## When the refusal is the answer
 *
 * A coach can take a portal access away while the athlete still has a tab open
 * (§21). Every procedure refuses that session from the next request on, because
 * the membership and the athlete link are read from the database each time —
 * but Better Auth's cookie cache keeps the *session* itself alive for up to five
 * minutes, and until then the refusal surfaced as the generic crash page.
 *
 * So a refusal renders one sentence and a way out instead. Not a redirect: with
 * the cookie still present the proxy would send `/sign-in` on to `/start`, which
 * sends an account without a coach profile back here. The children are not
 * rendered, so no page of the portal runs for a session this layout refused.
 *
 * It explains; it does not enforce. What refused is the procedure.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let me: Awaited<ReturnType<typeof api.portal.me>>;

  try {
    me = await api.portal.me();
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'FORBIDDEN') return <NoPortalAccess />;
    throw error;
  }

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

/** What a session sees once there is no athlete behind it any more. */
function NoPortalAccess() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-content flex-col justify-center gap-6 px-6 py-10">
      <div className="flex max-w-prose flex-col gap-2">
        <span className="eyebrow">Athletenbereich</span>
        <h1 className="text-2xl font-semibold text-balance">Kein Zugang zum Athletenbereich</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Mit diesem Konto ist der Athletenbereich nicht mehr erreichbar. Bitte melden Sie sich ab.
          Bei Fragen wenden Sie sich an Ihren Coach.
        </p>
      </div>

      <div>
        <SignOutButton />
      </div>
    </main>
  );
}
