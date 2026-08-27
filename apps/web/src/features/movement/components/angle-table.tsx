'use client';

import { Check, Minus, X } from 'lucide-react';

import {
  angleValueId,
  checkTargets,
  meetsTarget,
  rangeValueId,
  TARGET_COMPARISON_SYMBOLS,
  type AngleTargetConfig,
  type MovementProfile,
  type MovementSide,
  type MovementValue,
} from '@apex/domain';
import { Input } from '@apex/ui';

import { FOCUS_RING, TOUCH_FIELD } from '@/components/common/touch';

/**
 * Every measured angle, per track and side, with the target beside it.
 *
 * ## Why the positions and not only the range
 *
 * A range is a difference, and a difference loses where it happened: 95°
 * travelled from 175° to 80° is a squat, from 130° to 35° is not something a
 * knee does. The flexed column is what a coach reads first, so it is a column
 * and not a footnote.
 *
 * ## The target is the coach's, not the platform's
 *
 * There are no reference ranges here and none are implied. A cell is marked only
 * against a number the coach typed, and the marking says "Ziel erreicht" or
 * "Ziel nicht erreicht" — never "gut".
 *
 * ## Colour is never the only signal
 *
 * Every marked cell carries an icon and a word as well as a colour. Red and
 * green alone would put the whole point of the feature out of reach of anyone
 * who cannot separate them.
 *
 * ## One source
 *
 * The rows are built from the same `MovementValue` list the plan writes and the
 * summary describes, including the coach's edits — so a corrected number moves
 * the table, the sentence and the target verdict together.
 */

const NUMBER = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

const SIDE_LABELS: Readonly<Record<MovementSide, string>> = { left: 'links', right: 'rechts' };

export function AngleTable({
  profile,
  tracks,
  values,
  targets,
  drafts,
  onDraft,
  excluded,
  onToggle,
}: {
  readonly profile: MovementProfile;
  readonly tracks: readonly string[];
  readonly values: readonly MovementValue[];
  readonly targets: readonly AngleTargetConfig[];
  readonly drafts: Readonly<Record<string, string>>;
  readonly onDraft: (id: string, raw: string) => void;
  readonly excluded: readonly string[];
  readonly onToggle: (ids: readonly string[], include: boolean) => void;
}) {
  const edited = Object.fromEntries(
    Object.entries(drafts)
      .map(([id, raw]) => [id, Number(raw.replace(',', '.'))] as const)
      .filter(([, parsed]) => Number.isFinite(parsed)),
  );

  const valueOf = (id: string) => values.find((value) => value.id === id);

  const rows = profile.tracks
    .filter((track) => tracks.includes(track.key))
    .flatMap((track) =>
      profile.sides.flatMap((side) => {
        const cells = profile.positions.map((position) => ({
          position,
          value: valueOf(angleValueId(track.key, side, position.key)),
        }));

        const range = valueOf(rangeValueId(track.key, side));
        if (cells.every((cell) => cell.value === undefined) && range === undefined) return [];

        return [{ track, side, cells, range }];
      }),
    );

  if (rows.length === 0) return null;

  const outcomes = checkTargets(values, profile, targets, edited);
  const targetFor = (track: string, position: string) =>
    targets.find((target) => target.track === track && target.position === position) ?? null;

  return (
    <section aria-label="Winkel je Position" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Winkel je Position</h2>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          Median über alle Wiederholungen. Der Bewegungsumfang ist die Differenz der Positionen.
        </p>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="py-2 pr-4 font-medium">
                Winkel
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Seite
              </th>
              {profile.positions.map((position) => (
                <th key={position.key} scope="col" className="py-2 pr-4 font-medium capitalize">
                  {position.label}
                </th>
              ))}
              <th scope="col" className="py-2 pr-4 font-medium">
                Bewegungsumfang
              </th>
              <th scope="col" className="py-2 font-medium">
                Speichern
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const ids = [
                ...row.cells.flatMap((cell) => (cell.value ? [cell.value.id] : [])),
                ...(row.range ? [row.range.id] : []),
              ];

              return (
                <tr key={`${row.track.key}_${row.side}`} className="border-b border-border/60">
                  <td className="py-2 pr-4 break-words">{row.track.label}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{SIDE_LABELS[row.side]}</td>

                  {row.cells.map((cell) => {
                    const target = targetFor(row.track.key, cell.position.key);
                    const degrees =
                      cell.value === undefined
                        ? undefined
                        : (edited[cell.value.id] ?? cell.value.value);

                    return (
                      <td key={cell.position.key} className="py-2 pr-4">
                        {cell.value === undefined || degrees === undefined ? (
                          '—'
                        ) : (
                          <AngleCell
                            id={cell.value.id}
                            label={`${row.track.label} ${cell.position.label} ${SIDE_LABELS[row.side]}`}
                            degrees={degrees}
                            draft={drafts[cell.value.id]}
                            onDraft={onDraft}
                            reached={target === null ? null : meetsTarget(degrees, target)}
                            target={target}
                          />
                        )}
                      </td>
                    );
                  })}

                  <td className="py-2 pr-4">
                    {row.range === undefined ? (
                      '—'
                    ) : (
                      <span className="flex items-center gap-1">
                        <Input
                          className={`${TOUCH_FIELD} w-24`}
                          type="text"
                          inputMode="decimal"
                          aria-label={`Bewegungsumfang ${row.track.label} ${SIDE_LABELS[row.side]} in Grad`}
                          value={drafts[row.range.id] ?? NUMBER.format(row.range.value)}
                          onChange={(event) => onDraft(row.range?.id ?? '', event.target.value)}
                        />
                        <span className="text-muted-foreground">°</span>
                      </span>
                    )}
                  </td>

                  <td className="py-2">
                    <label className="flex min-h-11 cursor-pointer items-center lg:min-h-8">
                      <input
                        type="checkbox"
                        className={`${FOCUS_RING} size-4 rounded border-input`}
                        aria-label={`${row.track.label} ${SIDE_LABELS[row.side]} speichern`}
                        checked={ids.some((id) => !excluded.includes(id))}
                        // One tick governs the row: the angles and the range
                        // describe one joint on one side, and saving half of
                        // that is not a decision anybody wants to make.
                        onChange={(event) => onToggle(ids, event.target.checked)}
                      />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {outcomes.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {outcomes.map((outcome) => (
            <li
              key={`${outcome.target.track}_${outcome.target.position}`}
              className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-2 text-sm ${
                outcome.verdict === 'reached'
                  ? 'bg-accent-soft text-accent-soft-foreground'
                  : outcome.verdict === 'missed'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {outcome.verdict === 'reached' ? (
                <Check aria-hidden="true" className="size-4 shrink-0" />
              ) : outcome.verdict === 'missed' ? (
                <X aria-hidden="true" className="size-4 shrink-0" />
              ) : (
                <Minus aria-hidden="true" className="size-4 shrink-0" />
              )}

              <span className="font-medium">{outcome.label}</span>
              <span data-numeric>
                {outcome.sides
                  .map(
                    (side) =>
                      `${side.side === 'LEFT' ? 'links' : 'rechts'} ${NUMBER.format(side.degrees)}°`,
                  )
                  .join(', ')}
              </span>
              <span data-numeric>
                · Ziel {TARGET_COMPARISON_SYMBOLS[outcome.target.comparison]}{' '}
                {NUMBER.format(outcome.target.degrees)}°
              </span>
              <span className="font-medium">
                ·{' '}
                {outcome.verdict === 'reached'
                  ? 'Ziel erreicht'
                  : outcome.verdict === 'missed'
                    ? 'Ziel nicht erreicht'
                    : 'nichts gemessen'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AngleCell({
  id,
  label,
  degrees,
  draft,
  onDraft,
  reached,
  target,
}: {
  readonly id: string;
  readonly label: string;
  readonly degrees: number;
  readonly draft: string | undefined;
  readonly onDraft: (id: string, raw: string) => void;
  readonly reached: boolean | null;
  readonly target: AngleTargetConfig | null;
}) {
  const field = (
    <span className="flex items-center gap-1">
      <Input
        className={`${TOUCH_FIELD} w-24`}
        type="text"
        inputMode="decimal"
        aria-label={`${label} in Grad`}
        value={draft ?? NUMBER.format(degrees)}
        onChange={(event) => onDraft(id, event.target.value)}
      />
      <span className="text-muted-foreground">°</span>
    </span>
  );

  if (reached === null || target === null) return field;

  return (
    <span
      className={`inline-flex flex-col gap-0.5 rounded px-1.5 py-1 ${
        reached
          ? 'bg-accent-soft text-accent-soft-foreground'
          : 'bg-destructive/10 text-destructive'
      }`}
    >
      {field}
      <span className="flex items-center gap-1 text-xs font-medium">
        {reached ? (
          <Check aria-hidden="true" className="size-3 shrink-0" />
        ) : (
          <X aria-hidden="true" className="size-3 shrink-0" />
        )}
        {reached ? 'Ziel erreicht' : 'Ziel nicht erreicht'}
      </span>
    </span>
  );
}
