'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  ASSESSMENT_MODULE_STATUS_LABELS,
  MEASUREMENT_ROLE_LABELS,
  MODULE_LABELS,
  type AssessmentModuleStatus,
  type MeasurementRole,
  type ModuleKey,
} from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { removeModuleAction } from '../server/actions';

import { CopyModuleButton, type CopyTarget } from './copy-module-button';

export interface ModuleCardData {
  id: string;
  moduleKey: string;
  moduleVersion: number;
  configuration: {
    measurementTypes: { measurementTypeId: string; role: MeasurementRole }[];
    exerciseIds: string[];
    passes: number;
    recordsSide: boolean;
    dimensions: { key: string; label: string; values?: string[] }[];
    notes?: string;
  } | null;
  status: AssessmentModuleStatus;
}

/**
 * One configured test inside an assessment.
 *
 * What it shows is the *plan* — how many quantities, how many passes, along
 * which dimensions. The values are the Measurements and arrive with the entry
 * screen; keeping the two apart is what makes copying an assessment a copy of
 * this card and nothing else.
 */
export function ModuleCard({
  module,
  assessmentId,
  typeNames,
  exerciseNames,
  copyTargets,
}: {
  module: ModuleCardData;
  assessmentId: string;
  typeNames: Record<string, string>;
  exerciseNames: Record<string, string>;
  /** The athlete's other assessments — a test is copied into one of those. */
  copyTargets: readonly CopyTarget[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const configuration = module.configuration;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {MODULE_LABELS[module.moduleKey as ModuleKey] ?? module.moduleKey}
          </span>
          {configuration && configuration.passes > 1 ? (
            <Badge variant="accent">{configuration.passes} passes</Badge>
          ) : null}
          {configuration?.recordsSide ? <Badge variant="outline">Left / right</Badge> : null}
          <Badge variant="secondary">{ASSESSMENT_MODULE_STATUS_LABELS[module.status]}</Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/assessments/${assessmentId}/tests/${module.id}`}>Perform</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/assessments/${assessmentId}/tests/${module.id}/configure`}>
              Configure
            </Link>
          </Button>
          <CopyModuleButton
            moduleId={module.id}
            moduleKey={module.moduleKey}
            assessmentId={assessmentId}
            targets={copyTargets}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await removeModuleAction(module.id, assessmentId);
                if (result.message) setError(result.message);
                else router.refresh();
              });
            }}
          >
            {pending ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </div>

      {configuration ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Records</dt>
          <dd>
            {configuration.measurementTypes
              .map((entry) => {
                const name = typeNames[entry.measurementTypeId] ?? 'Unknown measurement';

                // Required is the ordinary case and stays unmarked; the other
                // two are what a coach needs to see at a glance.
                return entry.role === 'required'
                  ? name
                  : `${name} (${MEASUREMENT_ROLE_LABELS[entry.role].toLowerCase()})`;
              })
              .join(' · ')}
          </dd>

          {configuration.exerciseIds.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Exercises</dt>
              <dd>
                {configuration.exerciseIds
                  .map((id) => exerciseNames[id] ?? 'Unknown exercise')
                  .join(' · ')}
              </dd>
            </>
          ) : null}

          {configuration.dimensions.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Dimensions</dt>
              <dd>
                {configuration.dimensions
                  .map((dimension) =>
                    dimension.values?.length
                      ? `${dimension.label} (${dimension.values.join(', ')})`
                      : dimension.label,
                  )
                  .join(' · ')}
              </dd>
            </>
          ) : null}

          {configuration.notes ? (
            <>
              <dt className="text-muted-foreground">Protocol</dt>
              <dd className="text-pretty">{configuration.notes}</dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          This test was configured under an older shape and cannot be read. The measurements it
          holds are unaffected.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
