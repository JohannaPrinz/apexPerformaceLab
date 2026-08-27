import { PoseCamera } from '@/features/pose-poc/pose-camera';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bewegungserkennung — Erprobung',
};

/**
 * Does pose estimation run usably in a browser on a tablet?
 *
 * That is the only question this page exists to answer. It stores nothing,
 * reads nothing and belongs to no assessment — see `features/pose-poc`.
 */
export default function PosePocPage() {
  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Technische Erprobung</span>
        <h1 className="text-2xl font-semibold">Bewegungserkennung im Browser</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Kamerabild, Skelett, Knie- und Hüftwinkel und gezählte Wiederholungen einer Kniebeuge.
          Alles läuft lokal im Browser — es wird nichts übertragen und nichts gespeichert. Die
          Zahlen sind Messwerte, keine Bewertung.
        </p>
      </header>

      <PoseCamera />

      <p className="text-xs text-muted-foreground">
        Für brauchbare Winkel seitlich zum Athleten filmen, ganzen Körper im Bild, gleichmäßiges
        Licht. Erprobung ohne Anbindung an Assessments oder Messwerte.
      </p>
    </main>
  );
}
