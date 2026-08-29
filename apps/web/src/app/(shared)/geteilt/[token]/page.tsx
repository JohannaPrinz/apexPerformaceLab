import { notFound } from 'next/navigation';

import { db } from '@apex/database';
import { shareDaysLeft } from '@apex/domain';

import { SharedReport, SharePasswordForm } from '@/features/reports';
import { hasSharePass } from '@/features/reports/server/share-access';
import { resolveShare } from '@/features/reports/server/sharing';

import type { Metadata } from 'next';

/**
 * A published analysis, opened by somebody without an account.
 *
 * ## Why this page reads the database directly
 *
 * Every other read in this application goes through tRPC, which resolves a
 * session and a workspace first. Here there is neither: the visitor is an
 * athlete with a link, and the link **is** the authorisation. Routing that
 * through the tenant-scoped API would mean inventing a session for them.
 *
 * The safety of that rests on three things, all of them in `resolveShare`:
 * the token is 256 random bits and names exactly one row, no identifier from
 * the caller is trusted for anything else, and only a `PUBLISHED` report is
 * ever returned.
 *
 * ## Why it is outside the protected prefixes
 *
 * `proxy.ts` protects by allow-list, so `/geteilt` is public without an
 * exception having to be written for it. Nothing here reads a session cookie
 * and nothing here reveals whether the visitor has an account.
 *
 * ## What a wrong token is told
 *
 * Nothing. `notFound()` — the same answer as for a token that never existed, a
 * revoked one and one whose report was unpublished. Distinguishing them would
 * turn the page into an oracle for guessing links.
 */
export const metadata: Metadata = {
  title: 'Auswertung',
  // A shared document has no business in a search index.
  robots: { index: false, follow: false },
};

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await resolveShare(db, token);

  if (!share) notFound();

  if (!share.active) {
    return (
      <Frame>
        <h1 className="text-xl font-semibold">Dieser Link gilt nicht mehr</h1>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          {share.state === 'REVOKED'
            ? 'Der Zugang wurde zurückgezogen.'
            : 'Der Link ist abgelaufen.'}{' '}
          Wende dich an deinen Coach — ein neuer Link ist schnell erstellt.
        </p>
      </Frame>
    );
  }

  const unlocked =
    share.passwordHash === null || (await hasSharePass(share.id, share.passwordHash));

  if (!unlocked) {
    return (
      <Frame>
        <h1 className="text-xl font-semibold">Deine Auswertung</h1>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          Diese Seite ist mit einem Passwort geschützt. Du hast es separat von deinem Coach
          bekommen.
        </p>
        <SharePasswordForm token={token} />
      </Frame>
    );
  }

  if (!share.snapshot) {
    // A published report whose stored document cannot be read. Better to say so
    // than to render a page with holes in it.
    return (
      <Frame>
        <h1 className="text-xl font-semibold">Diese Auswertung lässt sich nicht anzeigen</h1>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          Bitte wende dich an deinen Coach.
        </p>
      </Frame>
    );
  }

  const daysLeft = shareDaysLeft(share.expiresAt);

  return (
    <Frame>
      <SharedReport snapshot={share.snapshot} />

      {daysLeft === null ? null : (
        <p className="border-t border-border pt-4 text-xs text-muted-foreground">
          Dieser Link ist noch {daysLeft === 0 ? 'heute' : `${String(daysLeft)} Tage`} gültig.
        </p>
      )}
    </Frame>
  );
}

/** The whole chrome this page has: no navigation, no workspace, no account. */
function Frame({ children }: { readonly children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-6 px-6 py-12">{children}</main>
  );
}
