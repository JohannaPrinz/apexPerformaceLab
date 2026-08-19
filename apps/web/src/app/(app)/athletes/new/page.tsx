import Link from 'next/link';

import { AthleteForm } from '@/features/athletes';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Athlet anlegen',
};

export default function NewAthletePage() {
  return (
    <main className="mx-auto flex w-full max-w-narrow flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        <Link href="/athletes" className="text-xs text-muted-foreground hover:underline">
          ← Athleten
        </Link>
        <h1 className="text-3xl font-semibold">Athlet anlegen</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Nur der Name wird benötigt. Ein Athlet braucht kein Benutzerkonto, und Kontaktdaten, Größe
          und Gewicht können später folgen.
        </p>
      </div>

      <AthleteForm />
    </main>
  );
}
