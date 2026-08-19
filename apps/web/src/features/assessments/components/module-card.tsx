'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  canRemoveModule,
  type AssessmentModuleStatus,
  type MeasurementRole,
  type ModuleKey,
} from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';

import { removeModuleAction } from '../server/actions';

import { CopyModuleButton, type CopyTarget } from './copy-module-button';
import { MEASUREMENT_ROLE_LABELS_DE, MODULE_LABELS_DE, MODULE_STATUS_LABELS_DE } from './labels';

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
  /** A test holding values is never removable, whatever its status (§13). */
  measurementCount: number;
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
  assessmentBegun,
}: {
  module: ModuleCardData;
  assessmentId: string;
  typeNames: Record<string, string>;
  exerciseNames: Record<string, string>;
  /** The athlete's other assessments — a test is copied into one of those. */
  copyTargets: readonly CopyTarget[];
  /**
   * Whether any test of this assessment has left `PLANNED`.
   *
   * A property of the assessment, not of this card, so it is passed in: the
   * page already holds every module and would otherwise make each card work it
   * out from data it cannot see.
   */
  assessmentBegun: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const configuration = module.configuration;

  /**
   * The same rule the service enforces, asked here only to decide what to show.
   *
   * The server refuses regardless — this is not the control, it is the courtesy
   * of not offering a button that cannot work.
   */
  const removal = canRemoveModule(module.status, module.measurementCount, assessmentBegun);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {MODULE_LABELS_DE[module.moduleKey as ModuleKey] ?? module.moduleKey}
          </span>
          {configuration && configuration.passes > 1 ? (
            <Badge variant="accent">{configuration.passes} Stufen</Badge>
          ) : null}
          {configuration?.recordsSide ? <Badge variant="outline">Links / rechts</Badge> : null}
          <Badge variant="secondary">{MODULE_STATUS_LABELS_DE[module.status]}</Badge>
        </div>

        {/* `flex-wrap`: four German labels at 44px do not fit a 375px row,
            and without wrapping they widen the page instead of stacking.
            Measured at 375px: the row was 495px. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className={TOUCH_BUTTON} asChild>
            <Link href={`/assessments/${assessmentId}/tests/${module.id}`}>Durchführen</Link>
          </Button>
          <Button variant="ghost" className={TOUCH_BUTTON} asChild>
            <Link href={`/assessments/${assessmentId}/tests/${module.id}/configure`}>
              Konfigurieren
            </Link>
          </Button>
          <CopyModuleButton
            moduleId={module.id}
            moduleKey={module.moduleKey}
            assessmentId={assessmentId}
            targets={copyTargets}
          />
          {removal.ok ? (
            <Button
              variant="ghost"
              className={TOUCH_BUTTON}
              disabled={pending}
              // Two steps, not `window.confirm`: the browser dialog cannot be
              // styled, reads in the wrong language on some systems, and says
              // nothing about *what* is being removed. This one names the test.
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              Entfernen
            </Button>
          ) : (
            <Button
              variant="ghost"
              className={TOUCH_BUTTON}
              disabled
              title={
                removal.reason === 'HAS_MEASUREMENTS'
                  ? 'Dieser Test enthält Messwerte. Messwerte werden nie gelöscht.'
                  : 'Dieses Assessment wurde bereits durchgeführt. Nur übersprungene Tests lassen sich entfernen.'
              }
            >
              Entfernen
            </Button>
          )}
        </div>
      </div>

      {configuration ? (
        <dl
          // `1fr` still carries `min-width: auto`, so a long unbroken
          // measurement name would widen the grid rather than wrap inside it.
          className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm [&>dd]:min-w-0 [&>dd]:break-words"
        >
          <dt className="text-muted-foreground">Messgrößen</dt>
          <dd>
            {configuration.measurementTypes
              .map((entry) => {
                const name = typeNames[entry.measurementTypeId] ?? 'Unbekannte Messgröße';

                // Required is the ordinary case and stays unmarked; the other
                // two are what a coach needs to see at a glance.
                return entry.role === 'required'
                  ? name
                  : `${name} (${MEASUREMENT_ROLE_LABELS_DE[entry.role].toLowerCase()})`;
              })
              .join(' · ')}
          </dd>

          {configuration.exerciseIds.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Übungen</dt>
              <dd>
                {configuration.exerciseIds
                  .map((id) => exerciseNames[id] ?? 'Unbekannte Übung')
                  .join(' · ')}
              </dd>
            </>
          ) : null}

          {configuration.dimensions.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Merkmale</dt>
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
              <dt className="text-muted-foreground">Protokoll</dt>
              <dd className="text-pretty">{configuration.notes}</dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          Dieser Test wurde mit einer älteren Struktur konfiguriert und kann nicht gelesen werden.
          Die erfassten Messwerte sind davon nicht betroffen.
        </p>
      )}

      {confirming ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-md border border-border-strong bg-muted p-3"
        >
          <p className="text-sm text-pretty">
            <span className="font-medium">
              {MODULE_LABELS_DE[module.moduleKey as ModuleKey] ?? module.moduleKey}
            </span>{' '}
            wird aus diesem Assessment entfernt. Die Konfiguration geht dabei verloren.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className={TOUCH_BUTTON}
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await removeModuleAction(module.id, assessmentId);
                  if (result.message) setError(result.message);
                  else {
                    setConfirming(false);
                    router.refresh();
                  }
                });
              }}
            >
              {pending ? 'Wird entfernt…' : 'Ja, entfernen'}
            </Button>
            <Button
              variant="ghost"
              className={TOUCH_BUTTON}
              disabled={pending}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
