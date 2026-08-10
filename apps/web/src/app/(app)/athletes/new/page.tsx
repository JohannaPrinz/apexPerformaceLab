import Link from 'next/link';

import { AthleteForm } from '@/features/athletes';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Add athlete',
};

export default function NewAthletePage() {
  return (
    <main className="mx-auto flex w-full max-w-narrow flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        <Link href="/athletes" className="text-xs text-muted-foreground hover:underline">
          ← Athletes
        </Link>
        <h1 className="text-3xl font-semibold">Add athlete</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Only the name is needed. An athlete does not need an account, and contact details can
          follow later.
        </p>
      </div>

      <AthleteForm />
    </main>
  );
}
