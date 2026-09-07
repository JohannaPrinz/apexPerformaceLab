import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft } from 'lucide-react';

import { TOUCH_TARGET } from '@/components/common/touch';
import { SaveAsPdf, SharedReport } from '@/features/reports';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Auswertung',
  // A personal analysis has no business in a search index.
  robots: { index: false, follow: false },
};

/**
 * One analysis, read by the athlete it is about (§21).
 *
 * ## Why there is no password here
 *
 * The same document behind `/geteilt/<token>` asks for one, because there the
 * password *is* the proof of who is reading. Here the account is, and it is the
 * stronger of the two. What has not changed is who decides: the analysis only
 * appears because the coach granted a Share for it, and withdrawing that link
 * closes this page as well.
 *
 * ## Why the report id may sit in the address
 *
 * It decides nothing on its own. `sharedReportFor` puts it into a filter that
 * already carries the workspace, the athlete resolved from the session, and an
 * active share — so another athlete's id finds no row. That is the same shape
 * as everywhere else in the portal; what must never appear in an address is the
 * **athlete**, and it does not.
 */
export default async function PortalReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;

  const report = await api.portal.sharedReport({ reportId }).catch((error: unknown) => {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });

  return (
    <>
      <Link
        href="/portal"
        className={`${TOUCH_TARGET} inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground print:hidden`}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Zurück zu meinem Bereich
      </Link>

      <SharedReport snapshot={report.snapshot} />

      {/* The account outlives any link; a saved copy outlives the account. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 print:hidden">
        <SaveAsPdf />
        <p className="text-xs text-muted-foreground">
          Das gespeicherte PDF bleibt Ihnen, unabhängig von diesem Zugang.
        </p>
      </div>
    </>
  );
}
