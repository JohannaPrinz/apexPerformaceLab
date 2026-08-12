'use client';

import { useMemo, useState } from 'react';

import type { MeasurementRole } from '@apex/domain';
import { Badge, Button, Input } from '@apex/ui';

import {
  MEASUREMENT_ROLE_LABELS,
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
          <h3 className="text-sm font-medium">What this test records</h3>
          <p className="text-xs text-muted-foreground">
            The order is the order the entry screen asks for them in.
          </p>
        </div>

        {draft.measurementTypes.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing chosen yet. A test without a measurement records nothing.
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
                      {option?.name ?? 'Unknown measurement'}
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
                    aria-label={`Role for ${option?.name ?? 'this measurement'}`}
                    className="flex overflow-hidden rounded-md border border-border"
                  >
                    {ROLES.map((role) => (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={entry.role === role}
                        onClick={() => onChange(withRole(draft, entry.measurementTypeId, role))}
                        className={`px-2.5 py-1 text-xs transition-colors ${
                          entry.role === role
                            ? 'bg-accent-soft text-accent-soft-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {MEASUREMENT_ROLE_LABELS[role]}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() =>
                        onChange(withMeasurementTypeMoved(draft, entry.measurementTypeId, -1))
                      }
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Move down"
                      disabled={index === draft.measurementTypes.length - 1}
                      onClick={() =>
                        onChange(withMeasurementTypeMoved(draft, entry.measurementTypeId, 1))
                      }
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onChange(withoutMeasurementType(draft, entry.measurementTypeId))
                      }
                    >
                      Remove
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
            <h3 className="text-sm font-medium">Add a measurement</h3>
            <p className="text-xs text-muted-foreground">
              Any quantity may be combined with any test — the catalogue is filtered by area, never
              restricted by it.
            </p>
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            aria-label="Search measurements"
            className="h-9 w-48"
          />
        </div>

        {available.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {search.trim() === ''
              ? 'Everything in the catalogue is already part of this test.'
              : 'Nothing matches that.'}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {available.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => onChange(withMeasurementType(draft, option.id))}
                  className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm transition-colors hover:border-border-strong hover:bg-muted"
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
