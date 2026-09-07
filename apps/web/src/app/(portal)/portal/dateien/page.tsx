import Link from 'next/link';

import { ArrowLeft } from 'lucide-react';

import { TOUCH_TARGET } from '@/components/common/touch';
import { PortalFiles } from '@/features/portal/components/portal-files';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Meine Dateien',
};

/**
 * The athlete's own files (§18, §21).
 *
 * **No athlete in the address**, as everywhere in the portal: both reads below
 * resolve the record from the session, so there is no parameter to change and
 * no other athlete to reach.
 */
export default async function PortalFilesPage() {
  const [me, files] = await Promise.all([api.portal.me(), api.portal.files()]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href="/portal"
          className={`${TOUCH_TARGET} inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Zurück zu meinem Bereich
        </Link>

        <h1 className="text-2xl font-semibold text-pretty">Meine Dateien</h1>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          Hier legen Sie Dokumente, Fotos und Videos ab — etwa eine Aufnahme für den Formcheck. Ihr
          Coach sieht dieselbe Ablage.
        </p>
      </div>

      <PortalFiles folders={files.folders} files={files.assets} readOnly={me.archivedAt !== null} />
    </>
  );
}
