'use client';

import { Info } from 'lucide-react';

import type { Keyframe } from '../analysis/keyframes';

/**
 * The stills the numbers can be checked against — one per named position.
 *
 * ## Why a picture belongs beside the numbers
 *
 * A range of motion is the difference between two postures. Showing those
 * postures with the measured angles drawn on them is the difference between a
 * coach trusting a number and a coach being able to check it — and a number in
 * an athlete's record should be checkable.
 *
 * ## What the pictures are not
 *
 * They are not stored, not uploaded, and not evidence in the domain sense. They
 * exist while this screen is open. The caption says so, because a picture that
 * looks like a saved artefact and disappears is worse than one that never
 * claimed to be saved.
 */

const NUMBER = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

export function KeyframeStrip({
  keyframes,
  kept,
}: {
  readonly keyframes: readonly Keyframe[];
  /**
   * Whether saving this analysis also keeps the stills.
   *
   * The sentence below used to say they are never stored, and that stopped being
   * true once an analysis could hand one to a report. A caption that describes
   * the old behaviour is worse than none — a coach decides what to send on the
   * strength of it.
   */
  readonly kept: boolean;
}) {
  if (keyframes.length === 0) return null;

  return (
    <section aria-label="Standbilder" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Woher die Werte kommen</h2>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          Die repräsentative Wiederholung — die, deren Werte dem Median in der Tabelle am nächsten
          liegen. Eingezeichnet sind dieselben Messungen, aus denen die Tabelle entsteht.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {keyframes.map((frame) => (
          <li key={frame.position} className="flex flex-col gap-2">
            {/* A plain img: the source is a data URL produced in this tab, so
                there is nothing for an image optimiser to do and next/image
                would only add a loader for a blob that never leaves. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={frame.dataUrl}
              alt={`${frame.label}, Sekunde ${(frame.timestampMs / 1000).toFixed(1)}: ${frame.angles
                .map((angle) => `${angle.label} ${NUMBER.format(angle.degrees)} Grad`)
                .join(', ')}`}
              className="max-h-[60vh] w-auto rounded-md border border-border object-contain"
            />

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              {frame.angles.map((angle) => (
                <div key={angle.track} className="contents">
                  <dt className="break-words text-muted-foreground">{angle.label}</dt>
                  <dd data-numeric>{NUMBER.format(angle.degrees)}°</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <p className="flex max-w-prose items-start gap-1.5 text-xs text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        {kept
          ? 'Beim Speichern werden diese Standbilder zur Auswertung abgelegt. Nur die, die Sie dort auswählen, gehen an den Athleten — die übrigen werden wieder gelöscht.'
          : 'Die Standbilder werden nur hier angezeigt und nicht gespeichert.'}{' '}
        Eingezeichnet ist die Seite, die das Modell sicherer erkannt hat (
        {keyframes[0]?.side === 'left' ? 'links' : 'rechts'}).
      </p>
    </section>
  );
}
