'use client';

import { AlertTriangle, Target } from 'lucide-react';

import {
  TARGET_COMPARISON_KEYS,
  TARGET_COMPARISON_LABELS_DE,
  TARGET_COMPARISON_SYMBOLS,
  type AngleTargetConfig,
  type MovementProfile,
  type TargetComparisonKey,
} from '@apex/domain';
import { Input } from '@apex/ui';

import { FOCUS_RING, TOUCH_FIELD } from '@/components/common/touch';

/**
 * What the coach decides before the video is even chosen.
 *
 * ## Why the angles come first
 *
 * The profile offers what the movement *can* be described by; the coach decides
 * what is relevant **for this test**. Asking afterwards would mean measuring
 * things nobody wanted and then hiding them, which is slower and leaves the
 * deselected angles in the result object waiting to be shown by accident.
 *
 * ## Why a deselected angle disappears completely
 *
 * It is not measured, not stored, not summarised, and cannot fail a target. A
 * coach who says the ankle is not relevant here has said something, and a
 * "Ziel nicht erreicht" for it afterwards would be noise reported as a finding.
 *
 * ## Why the target sits in the same row as its angle
 *
 * They are one decision — "I care about the knee, and I want it at or below 90°"
 * — and splitting them across two lists makes the coach hold the pairing in
 * their head. The row collapses to just the checkbox until a target is wanted.
 */

export function AnalysisSetup({
  profile,
  tracks,
  targets,
  onTracksChange,
  onTargetsChange,
}: {
  readonly profile: MovementProfile;
  readonly tracks: readonly string[];
  readonly targets: readonly AngleTargetConfig[];
  readonly onTracksChange: (tracks: readonly string[]) => void;
  readonly onTargetsChange: (targets: readonly AngleTargetConfig[]) => void;
}) {
  const targetFor = (track: string) => targets.find((target) => target.track === track) ?? null;

  const setTarget = (track: string, next: AngleTargetConfig | null) => {
    const rest = targets.filter((target) => target.track !== track);

    onTargetsChange(next === null ? rest : [...rest, next]);
  };

  const toggleTrack = (track: string, include: boolean) => {
    onTracksChange(
      include
        ? profile.tracks
            .map((entry) => entry.key)
            .filter((key) => key === track || tracks.includes(key))
        : tracks.filter((key) => key !== track),
    );

    // A target on an angle nobody measures cannot be checked, so it goes with it.
    if (!include) setTarget(track, null);
  };

  return (
    <section aria-label="Winkel und Ziele" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Winkel für diesen Test</h2>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          {profile.name}. Abgewählte Winkel werden nicht gemessen, nicht gespeichert und tauchen in
          der Auswertung nicht auf. Ein Ziel ist immer optional — Apex OS bringt keine Normwerte
          mit.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {profile.tracks.map((track) => {
          const selected = tracks.includes(track.key);
          const target = targetFor(track.key);
          const suggestion = profile.suggestedTargets.find((entry) => entry.track === track.key);

          return (
            <li key={track.key} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium lg:min-h-8">
                  <input
                    type="checkbox"
                    className={`${FOCUS_RING} size-4 shrink-0 rounded border-input`}
                    checked={selected}
                    onChange={(event) => toggleTrack(track.key, event.target.checked)}
                  />
                  <span className="break-words">{track.label}</span>
                </label>

                {selected ? (
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm lg:min-h-8">
                    <input
                      type="checkbox"
                      className={`${FOCUS_RING} size-4 shrink-0 rounded border-input`}
                      checked={target !== null}
                      onChange={(event) =>
                        setTarget(
                          track.key,
                          event.target.checked
                            ? {
                                track: track.key,
                                // The profile's suggestion is where the coach
                                // starts, never what is applied on their behalf:
                                // this only runs because they ticked the box.
                                position: suggestion?.position ?? profile.positions[0]?.key ?? '',
                                comparison: suggestion?.comparison ?? 'at_most',
                                degrees: suggestion?.degrees ?? 90,
                              }
                            : null,
                        )
                      }
                    />
                    <Target aria-hidden="true" className="size-3.5 shrink-0" />
                    <span>Ziel festlegen</span>
                  </label>
                ) : null}
              </div>

              {selected && track.caution !== undefined ? (
                <p className="mt-2 flex max-w-prose items-start gap-1.5 text-xs text-pretty text-muted-foreground">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  {track.caution}
                </p>
              ) : null}

              {selected && target !== null ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium">Position</span>
                    <select
                      className={`${TOUCH_FIELD} ${FOCUS_RING} rounded-md border border-input bg-background px-3`}
                      value={target.position}
                      onChange={(event) =>
                        setTarget(track.key, { ...target, position: event.target.value })
                      }
                    >
                      {profile.positions.map((position) => (
                        <option key={position.key} value={position.key}>
                          {position.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium">Regel</span>
                    <select
                      className={`${TOUCH_FIELD} ${FOCUS_RING} rounded-md border border-input bg-background px-3`}
                      value={target.comparison}
                      onChange={(event) =>
                        setTarget(track.key, {
                          ...target,
                          comparison: event.target.value as TargetComparisonKey,
                        })
                      }
                    >
                      {TARGET_COMPARISON_KEYS.map((comparison) => (
                        <option key={comparison} value={comparison}>
                          {TARGET_COMPARISON_SYMBOLS[comparison]}{' '}
                          {TARGET_COMPARISON_LABELS_DE[comparison]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium">Grad</span>
                    <Input
                      className={TOUCH_FIELD}
                      type="text"
                      inputMode="decimal"
                      aria-label={`Zielwinkel ${track.label} in Grad`}
                      value={String(target.degrees).replace('.', ',')}
                      onChange={(event) => {
                        const parsed = Number(event.target.value.replace(',', '.'));
                        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 360) {
                          setTarget(track.key, { ...target, degrees: parsed });
                        }
                      }}
                    />
                  </label>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {tracks.length === 0 ? (
        <p role="alert" className="text-sm text-destructive">
          Mindestens ein Winkel muss ausgewählt sein, sonst gibt es nichts zu messen.
        </p>
      ) : null}
    </section>
  );
}
