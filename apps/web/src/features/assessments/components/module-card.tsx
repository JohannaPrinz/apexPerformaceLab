'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Check, History } from 'lucide-react';

import {
  canRemoveModule,
  type AssessmentModuleStatus,
  type MeasurementRole,
  type ModuleKey,
} from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_TARGET } from '@/components/common/touch';

import { ArchiveModuleButton } from '../measurements/components/archive-module-button';
import { RunTestButton } from '../measurements/components/run-test-button';
import { slotsForPass } from '../measurements/components/slots';
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
  /** What the coach called it; `null` on rows written before names existed. */
  name: string | null;
  /** What it is for. Not the protocol — that lives in the configuration. */
  description: string | null;
  /** A test holding values is never removable, whatever its status (§13). */
  measurementCount: number;
  /** How many values currently stand — superseded rows excluded. */
  recordedCount: number;
  /** When the most recent standing value was written. */
  lastRecordedAt: Date | null;
  /** When the test was first called finished. Null while it never was. */
  completedAt: Date | null;
  /** When it was last reopened afterwards. */
  reopenedAt: Date | null;
  /** When it was put away. An archived test leaves the working list, never the record. */
  archivedAt: Date | null;
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
  assessmentClosed,
}: {
  module: ModuleCardData;
  assessmentId: string;
  typeNames: Record<string, string>;
  exerciseNames: Record<string, string>;
  /** The athlete's other assessments — a test is copied into one of those. */
  copyTargets: readonly CopyTarget[];
  /**
   * Whether the examination is closed — finished, abandoned or put away.
   *
   * A property of the assessment, not of this card, so it is passed in. It
   * decides whether a test may still be removed: while the examination is live
   * that is editing the plan, once it is closed the record has to stand.
   */
  assessmentClosed: boolean;
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
  const removal = canRemoveModule(module.status, module.measurementCount, assessmentClosed);

  /**
   * How many values the test expects, and how many it holds.
   *
   * Counted from the configuration with the same function the entry screen
   * builds its grid from, so the tile cannot claim a number the screen does not
   * ask for. `null` when the configuration cannot be read — then there is no
   * expected number and saying "0 von 0" would be a claim, not a fact.
   */
  const progress =
    configuration === null
      ? null
      : (() => {
          const expected = slotsForPass(configuration).length * Math.max(configuration.passes, 1);

          return {
            expected,
            recorded: module.recordedCount,
            complete: expected > 0 && module.recordedCount >= expected,
          };
        })();

  /**
   * Whether values were entered after the coach called the test finished.
   *
   * `completedAt` is set once and never moved, so a standing value newer than
   * it was written afterwards — which is exactly the statement §13 wants
   * visible rather than buried in a correction chain.
   */
  const runHref = `/assessments/${assessmentId}/tests/${module.id}/run`;

  /**
   * Whether this test has been carried out.
   *
   * What decides which actions the tile offers: a plan is configured and
   * deleted, a performed test is repeated and put away. Read from the values it
   * holds as well as its status — a test someone entered readings into has been
   * performed, whatever the coach has said about it yet.
   */
  const performed =
    module.measurementCount > 0 || module.status === 'COMPLETED' || module.status === 'ABORTED';

  const changedAfterCompletion =
    module.completedAt !== null &&
    module.lastRecordedAt !== null &&
    module.lastRecordedAt.getTime() > module.completedAt.getTime();

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* The name identifies the test, the type says what kind it is —
              both, because three tests may share a type and only the name tells
              them apart. Older rows have no name and fall back to the type. */}
          <span className="flex min-w-0 flex-col">
            {/* The name is the way into the test. A tile that only offers
                actions gives a coach nowhere to *read* what the test holds —
                which is the more common thing to want once it has run. */}
            <Link
              href={`/assessments/${assessmentId}/tests/${module.id}`}
              // `TOUCH_TARGET`: this is the way into the test, and at 24px it
              // was the smallest control on the page.
              className={`${FOCUS_RING} ${TOUCH_TARGET} flex w-fit max-w-full items-center rounded font-medium break-words hover:underline`}
            >
              {module.name ?? MODULE_LABELS_DE[module.moduleKey as ModuleKey] ?? module.moduleKey}
            </Link>
            {module.name === null ? null : (
              <span className="text-xs text-muted-foreground">
                {MODULE_LABELS_DE[module.moduleKey as ModuleKey] ?? module.moduleKey}
              </span>
            )}
          </span>
          {configuration && configuration.passes > 1 ? (
            <Badge variant="accent">{configuration.passes} Stufen</Badge>
          ) : null}
          {configuration?.recordsSide ? <Badge variant="outline">Links / rechts</Badge> : null}
          {/* Status first, then how far the values got. They answer different
              questions and a coach scanning the list needs both: a completed
              test may still be missing values, and a running one may be full. */}
          <Badge variant={module.status === 'COMPLETED' ? 'accent' : 'secondary'}>
            {MODULE_STATUS_LABELS_DE[module.status]}
          </Badge>
          {progress === null ? null : (
            <Badge variant={progress.complete ? 'outline' : 'secondary'}>
              {progress.complete ? (
                <>
                  <Check aria-hidden="true" className="size-3.5" />
                  vollständig
                </>
              ) : (
                <span data-numeric>
                  {progress.recorded}/{progress.expected} Werte
                </span>
              )}
            </Badge>
          )}
        </div>

        {/* One row, wrapping, primary action last — which puts it on the right
            wherever there is room and at the bottom of the stack where there is
            not. `flex-wrap` because four German labels at 44px do not fit a
            375px row and would widen the page instead of stacking.

            Which buttons appear depends on whether the test has been performed:
            a plan is configured and removed, a performed test is repeated and
            put away. A performed test is never removed — its measurements are
            the record (§13). */}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {performed ? (
            <>
              <CopyModuleButton
                moduleId={module.id}
                assessmentId={assessmentId}
                targets={copyTargets}
              />
              <ArchiveModuleButton
                moduleId={module.id}
                assessmentId={assessmentId}
                archived={module.archivedAt !== null}
              />
              {/* The same button as on the overview, so a finished test opened
                  from either place records that it was reopened. */}
              <RunTestButton moduleId={module.id} href={runHref} status={module.status} performed />
            </>
          ) : (
            <>
              <Button variant="ghost" className={TOUCH_BUTTON} asChild>
                <Link href={`/assessments/${assessmentId}/tests/${module.id}/configure`}>
                  Konfigurieren
                </Link>
              </Button>
              <CopyModuleButton
                moduleId={module.id}
                assessmentId={assessmentId}
                targets={copyTargets}
              />
              {removal.ok ? (
                <Button
                  variant="ghost"
                  className={TOUCH_BUTTON}
                  disabled={pending}
                  // Two steps, not `window.confirm`: the browser dialog cannot
                  // be styled, reads in the wrong language on some systems, and
                  // says nothing about *what* is being removed. This one names
                  // the test.
                  onClick={() => {
                    setError(null);
                    setConfirming(true);
                  }}
                >
                  Löschen
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  className={TOUCH_BUTTON}
                  disabled
                  title={
                    removal.reason === 'HAS_MEASUREMENTS'
                      ? 'Dieser Test enthält Messwerte. Messwerte werden nie gelöscht — archivieren Sie ihn stattdessen.'
                      : 'Dieses Assessment ist abgeschlossen. Nur übersprungene Tests lassen sich noch löschen.'
                  }
                >
                  Löschen
                </Button>
              )}
              <RunTestButton
                moduleId={module.id}
                href={runHref}
                status={module.status}
                performed={false}
              />
            </>
          )}
        </div>
      </div>

      {module.description === null ? null : (
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          {module.description}
        </p>
      )}

      {module.completedAt === null ? null : (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            Abgeschlossen am <span data-numeric>{formatMoment(module.completedAt)}</span>
          </span>
          {module.reopenedAt === null ? null : (
            <span>
              · wieder geöffnet am <span data-numeric>{formatMoment(module.reopenedAt)}</span>
            </span>
          )}
          {changedAfterCompletion && module.lastRecordedAt !== null ? (
            <Badge variant="secondary">
              <History aria-hidden="true" className="size-3.5" />
              nach Abschluss geändert am{' '}
              <span data-numeric>{formatMoment(module.lastRecordedAt)}</span>
            </Badge>
          ) : null}
        </p>
      )}

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

/** Date and time, the way a German-speaking coach reads a timestamp. */
function formatMoment(value: Date): string {
  return value.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
