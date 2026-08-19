'use client';

import { useMemo, useState } from 'react';

import type { MeasurementRole } from '@apex/domain';
import { Badge, Button, Input } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';

import { MEASUREMENT_ROLE_LABELS_DE } from '../labels';

import {
  ROLE_EXPLANATIONS,
  withMeasurementType,
  withMeasurementTypeMoved,
  withoutMeasurementType,
  withRole,
  type BuilderDraft,
} from './draft';

export interface MeasurementTypeOption {
  id: string;
  key: string;
  name: string;
  unit: string;
  category: string;
  ownedByWorkspace: boolean;
}

const ROLES: readonly MeasurementRole[] = ['required', 'recommended', 'optional'];

/**
 * Choosing what a test records, and what each quantity is worth to it.
 *
 * The catalogue is the workspace's own types **and** the system ones — a coach
 * cannot tell from the list which is which except by the marker, because for
 * choosing purposes it does not matter (§12).
 *
 * The roles are shown with the sentence that explains them, never as the enum
 * name (§9): "required" alone tells a coach nothing about what happens if they
 * leave it out.
 */
export function MeasurementPicker({
  draft,
  options,
  onChange,
}: {
  draft: BuilderDraft;
  options: readonly MeasurementTypeOption[];
  onChange: (draft: BuilderDraft) => void;
}) {
  const [search, setSearch] = useState('');

  const chosenIds = new Set(draft.measurementTypes.map((entry) => entry.measurementTypeId));
  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);

  const available = options.filter((option) => {
    if (chosenIds.has(option.id)) return false;
    const needle = search.trim().toLowerCase();

    return (
      needle === '' ||
      option.name.toLowerCase().includes(needle) ||
      option.category.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Was dieser Test erfasst</h3>
          <p className="text-xs text-muted-foreground">
            Die Reihenfolge ist die Reihenfolge, in der die Eingabemaske danach fragt.
          </p>
        </div>

        {draft.measurementTypes.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Noch nichts ausgewählt. Ein Test ohne Messgröße erfasst nichts.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {draft.measurementTypes.map((entry, index) => {
              const option = byId.get(entry.measurementTypeId);

              return (
                <li
                  key={entry.measurementTypeId}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3"
                >
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {option?.name ?? 'Unbekannte Messgröße'}
                      {option ? (
                        <span className="text-muted-foreground"> · {option.unit}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ROLE_EXPLANATIONS[entry.role]}
                    </span>
                  </div>

                  <div
                    role="group"
                    aria-label={`Rolle für ${option?.name ?? 'diese Messgröße'}`}
                    className="flex overflow-hidden rounded-md border border-border"
                  >
                    {ROLES.map((role) => (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={entry.role === role}
                        onClick={() => onChange(withRole(draft, entry.measurementTypeId, role))}
                        className={`${TOUCH_TARGET} ${FOCUS_RING} px-3 text-xs transition-colors ${
                          entry.role === role
                            ? 'bg-accent-soft text-accent-soft-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {MEASUREMENT_ROLE_LABELS_DE[role]}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      className={TOUCH_BUTTON}
                      aria-label="Nach oben"
                      disabled={index === 0}
                      onClick={() =>
                        onChange(withMeasurementTypeMoved(draft, entry.measurementTypeId, -1))
                      }
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      className={TOUCH_BUTTON}
                      aria-label="Nach unten"
                      disabled={index === draft.measurementTypes.length - 1}
                      onClick={() =>
                        onChange(withMeasurementTypeMoved(draft, entry.measurementTypeId, 1))
                      }
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      className={TOUCH_BUTTON}
                      onClick={() =>
                        onChange(withoutMeasurementType(draft, entry.measurementTypeId))
                      }
                    >
                      Entfernen
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">Messgröße hinzufügen</h3>
            <p className="text-xs text-muted-foreground">
              Jede Messgröße lässt sich mit jedem Test kombinieren — der Katalog wird nach Bereich
              gefiltert, aber nie darauf beschränkt.
            </p>
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Suchen"
            aria-label="Messgrößen suchen"
            // Full width on a phone: at 375px the heading beside it wraps, and a
            // 12rem box on its own line looks broken rather than deliberate.
            className={`${TOUCH_FIELD} w-full sm:w-48`}
          />
        </div>

        {available.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {search.trim() === ''
              ? 'Alles aus dem Katalog gehört bereits zu diesem Test.'
              : 'Dazu passt nichts.'}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {available.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => onChange(withMeasurementType(draft, option.id))}
                  className={`${TOUCH_TARGET} ${FOCUS_RING} flex items-center gap-1.5 rounded-md border border-border px-3 text-sm transition-colors hover:border-border-strong hover:bg-muted`}
                >
                  <span>{option.name}</span>
                  <span className="text-xs text-muted-foreground">{option.unit}</span>
                  {option.ownedByWorkspace ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Own
                    </Badge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
