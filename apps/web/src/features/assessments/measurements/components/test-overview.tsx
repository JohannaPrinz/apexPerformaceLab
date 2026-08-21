'use client';

import Link from 'next/link';

import { ArrowRight, Check, History } from 'lucide-react';

import type { AssessmentModuleStatus, ModuleConfiguration, Readiness } from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';

import { EditModuleDialog } from '../../components/edit-module-dialog';
import {
  MEASUREMENT_ROLE_LABELS_DE,
  MODULE_LABELS_DE,
  MODULE_STATUS_LABELS_DE,
  READINESS_LABELS_DE,
  SIDE_LABELS_DE,
} from '../../components/labels';

import { ArchiveModuleButton } from './archive-module-button';
import { RunTestButton } from './run-test-button';
import {
  findRecorded,
  formatValue,
  passesOf,
  passProgress,
  slotsForPass,
  type RecordedMeasurement,
} from './slots';

/**
 * Everything one test is and holds — the screen a coach lands on from the tile.
 *
 * ## Why this is a page and not a panel
 *
 * Before it existed, a test had exactly one screen: the entry grid. Opening a
 * finished test to *read* it meant opening the surface built for changing it,
 * and there was nowhere at all to see when it was performed, what was corrected
 * afterwards, or what the coach wrote about it.
 *
 * ## It never changes a measurement
 *
 * Entering and correcting values happens in the runner, behind "Durchführen".
 * This screen reads. The one thing it edits is what the coach *called* the test
 * and what they wrote about it — text about the test, never the record itself.
 */
export function TestOverview({
  moduleId,
  assessmentId,
  moduleKey,
  moduleName,
  moduleDescription,
  status,
  configuration,
  types,
  exercises,
  measurements,
  notes,
  readiness,
  createdAt,
  completedAt,
  reopenedAt,
  archivedAt,
  nextModule,
}: {
  readonly moduleId: string;
  readonly assessmentId: string;
  readonly moduleKey: string;
  readonly moduleName: string | null;
  readonly moduleDescription: string | null;
  readonly status: AssessmentModuleStatus;
  readonly configuration: ModuleConfiguration | null;
  readonly types: Record<string, { name: string; unit: string; valueType: string }>;
  readonly exercises: Record<string, string>;
  readonly measurements: readonly RecordedMeasurement[];
  readonly notes: readonly { id: string; body: string; passIndex: number | null }[];
  readonly readiness: Readiness;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly reopenedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly nextModule: { id: string; label: string } | null;
}) {
  const typeLabel = MODULE_LABELS_DE[moduleKey as keyof typeof MODULE_LABELS_DE] ?? moduleKey;
  const title = (moduleName ?? '') === '' ? typeLabel : moduleName;

  const passes = configuration ? passesOf(configuration) : [];
  const slots = configuration ? slotsForPass(configuration) : [];

  /**
   * Whether anything was entered after the coach called the test finished.
   *
   * `completedAt` is set once and never moved, so a standing value newer than
   * it was written afterwards — which is the statement §13 wants visible.
   */
  const changedAfterCompletion =
    completedAt !== null &&
    measurements.some(
      (entry) =>
        entry.ingestedAt !== undefined && entry.ingestedAt.getTime() > completedAt.getTime(),
    );

  const runHref = `/assessments/${assessmentId}/tests/${moduleId}/run`;
  const performed = measurements.length > 0 || status === 'COMPLETED' || status === 'ABORTED';

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="eyebrow">{typeLabel}</span>
          <h1 className="text-2xl font-semibold text-pretty">{title}</h1>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status === 'COMPLETED' ? 'accent' : 'secondary'}>
              {MODULE_STATUS_LABELS_DE[status]}
            </Badge>
            <ReadinessBadge readiness={readiness} />
            {archivedAt === null ? null : <Badge variant="outline">Archiviert</Badge>}
          </div>

          {moduleDescription === null ? null : (
            <p className="max-w-prose text-sm text-pretty text-muted-foreground">
              {moduleDescription}
            </p>
          )}
        </div>

        {/* Primary action on the right, as everywhere. Reading a test and
            running it are different jobs; running it is the one that moves the
            session forward. */}
        <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
          <EditModuleDialog
            moduleId={moduleId}
            assessmentId={assessmentId}
            name={moduleName}
            description={moduleDescription}
            typeLabel={typeLabel}
          />
          <ArchiveModuleButton
            moduleId={moduleId}
            assessmentId={assessmentId}
            archived={archivedAt !== null}
          />
          <RunTestButton moduleId={moduleId} href={runHref} status={status} performed={performed} />
        </div>
      </header>

      {/* A named region: "Abgeschlossen" is also a status badge, and a screen
          reader jumping through the page needs to know which one it landed on. */}
      <section aria-label="Verlauf" className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Verlauf</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm [&>dd]:min-w-0 [&>dd]:break-words">
          <dt className="text-muted-foreground">Angelegt</dt>
          <dd data-numeric>{formatMoment(createdAt)}</dd>

          {completedAt === null ? null : (
            <>
              <dt className="text-muted-foreground">Abgeschlossen</dt>
              <dd data-numeric>{formatMoment(completedAt)}</dd>
            </>
          )}

          {reopenedAt === null ? null : (
            <>
              <dt className="text-muted-foreground">Wieder geöffnet</dt>
              <dd data-numeric>{formatMoment(reopenedAt)}</dd>
            </>
          )}

          {archivedAt === null ? null : (
            <>
              <dt className="text-muted-foreground">Archiviert</dt>
              <dd data-numeric>{formatMoment(archivedAt)}</dd>
            </>
          )}
        </dl>

        {changedAfterCompletion ? (
          <p className="flex w-fit items-center gap-1.5 rounded-md bg-accent-soft px-2 py-1 text-xs text-accent-soft-foreground">
            <History aria-hidden="true" className="size-3.5" />
            Nach dem Abschluss wurden Werte geändert. Sie sind unten hervorgehoben.
          </p>
        ) : null}
      </section>

      {configuration === null ? (
        <p className="text-sm text-muted-foreground">
          Dieser Test wurde mit einer Struktur konfiguriert, die nicht mehr gelesen werden kann. Die
          Messwerte sind davon nicht betroffen.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Aufbau</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm [&>dd]:min-w-0 [&>dd]:break-words">
              <dt className="text-muted-foreground">Messgrößen</dt>
              <dd>
                {configuration.measurementTypes
                  .map((entry) => {
                    const name = types[entry.measurementTypeId]?.name ?? 'Unbekannte Messgröße';

                    return entry.role === 'required'
                      ? name
                      : `${name} (${MEASUREMENT_ROLE_LABELS_DE[entry.role].toLowerCase()})`;
                  })
                  .join(' · ')}
              </dd>

              <dt className="text-muted-foreground">Stufen</dt>
              <dd data-numeric>{configuration.passes}</dd>

              {configuration.exerciseIds.length > 0 ? (
                <>
                  <dt className="text-muted-foreground">Übungen</dt>
                  <dd>
                    {configuration.exerciseIds
                      .map((id) => exercises[id] ?? 'Unbekannte Übung')
                      .join(' · ')}
                  </dd>
                </>
              ) : null}

              {configuration.dimensions.map((dimension) => (
                <div key={dimension.key} className="contents">
                  <dt className="text-muted-foreground">{dimension.label}</dt>
                  <dd>
                    {dimension.values && dimension.values.length > 0
                      ? dimension.values.join(' · ')
                      : 'wird bei der Messung benannt'}
                  </dd>
                </div>
              ))}

              {configuration.notes ? (
                <>
                  <dt className="text-muted-foreground">Protokoll</dt>
                  <dd className="text-pretty">{configuration.notes}</dd>
                </>
              ) : null}
            </dl>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-medium">Erfasste Werte</h2>

            {passes.map((pass) => {
              const progress = passProgress(configuration, measurements, pass);
              const complete = progress.expected > 0 && progress.filled >= progress.expected;

              return (
                <div key={String(pass)} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">
                      {pass === null ? 'Werte' : `Stufe ${String(pass)}`}
                    </h3>
                    {complete ? (
                      <Badge variant="accent">
                        <Check aria-hidden="true" className="size-3.5" />
                        vollständig
                      </Badge>
                    ) : progress.filled === 0 ? (
                      <Badge variant="outline">leer</Badge>
                    ) : (
                      <Badge variant="secondary">
                        <span data-numeric>
                          {progress.filled}/{progress.expected}
                        </span>
                      </Badge>
                    )}
                  </div>

                  <ul className="grid gap-2 sm:grid-cols-2">
                    {slots.map((slot) => {
                      const recorded = findRecorded(measurements, slot, pass);
                      const type = types[slot.measurementTypeId];
                      const corrected = recorded?.supersedes != null;
                      const qualifier = [
                        slot.side === 'BILATERAL' ? null : (SIDE_LABELS_DE[slot.side] ?? slot.side),
                        ...Object.values(slot.context),
                      ].filter((part) => part !== null);

                      return (
                        <li
                          key={slot.key}
                          className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 break-words">
                            {type?.name ?? 'Unbekannte Messgröße'}
                            {qualifier.length > 0 ? (
                              <span className="text-muted-foreground">
                                {' '}
                                · {qualifier.join(' · ')}
                              </span>
                            ) : null}
                          </span>

                          {recorded === undefined ? (
                            <span className="text-xs text-muted-foreground">nicht erfasst</span>
                          ) : (
                            <span className="flex items-baseline gap-1.5">
                              {/* A corrected reading is marked in colour: the
                                  value that stands is not the value that was
                                  first taken, and reading it as one would
                                  misstate the record. */}
                              <span
                                className={`font-medium ${corrected ? 'rounded bg-accent-soft px-1.5 text-accent-soft-foreground' : ''}`}
                                data-numeric
                              >
                                {formatValue(recorded)}
                                {type === undefined ? '' : ` ${type.unit}`}
                              </span>
                              {corrected ? (
                                <span className="text-xs text-accent-soft-foreground">
                                  korrigiert
                                </span>
                              ) : null}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {notes
                    .filter((entry) => entry.passIndex === pass)
                    .map((entry) => (
                      <p key={entry.id} className="text-sm text-pretty text-muted-foreground">
                        {entry.body}
                      </p>
                    ))}
                </div>
              );
            })}
          </section>
        </>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Notizen zum Test</h2>
        {notes.filter((entry) => entry.passIndex === null).length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Keine Notiz, die den ganzen Test betrifft. Notizen zu einzelnen Stufen stehen oben bei
            der Stufe.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes
              .filter((entry) => entry.passIndex === null)
              .map((entry) => (
                <li key={entry.id} className="rounded-md border border-border px-3 py-2 text-sm">
                  {entry.body}
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* Auswertung und Empfehlungen sind eine eigene Schicht (Insight, Report,
          Recommendation) und existieren im Produkt noch nicht. Hier steht
          deshalb nichts — ein Knopf, der nichts tut, wäre schlechter als seine
          Abwesenheit. */}

      <div className="flex flex-wrap items-center justify-start gap-2 border-t border-border pt-6 sm:justify-end">
        <Button variant="ghost" className={TOUCH_BUTTON} asChild>
          <Link href={`/assessments/${assessmentId}`}>Zurück zum Assessment</Link>
        </Button>

        {nextModule === null ? null : (
          <Button
            variant="outline"
            // `max-w-full` with a truncating label: the button base sets
            // `whitespace-nowrap`, so a long test name pushes the page sideways.
            className={`${TOUCH_BUTTON} max-w-full`}
            asChild
          >
            <Link href={`/assessments/${assessmentId}/tests/${nextModule.id}`}>
              <span className="min-w-0 truncate">Nächster Test: {nextModule.label}</span>
              <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
          </Button>
        )}

        <RunTestButton moduleId={moduleId} href={runHref} status={status} performed={performed} />
      </div>
    </div>
  );
}

/** The readiness the domain service computed. The screen only displays it. */
function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  if (readiness.level === 'COMPLETE')
    return <Badge variant="accent">{READINESS_LABELS_DE['COMPLETE']}</Badge>;
  if (readiness.level === 'PARTIAL') {
    return (
      <Badge variant="secondary">
        {READINESS_LABELS_DE['PARTIAL']}
        {readiness.missingPasses.length > 0
          ? ` · Stufe ${readiness.missingPasses.join(', ')} fehlt`
          : ''}
      </Badge>
    );
  }

  return <Badge variant="outline">{READINESS_LABELS_DE['INSUFFICIENT']}</Badge>;
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
