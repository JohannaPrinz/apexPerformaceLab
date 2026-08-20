import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft, Pencil } from 'lucide-react';

import { Badge, Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_TARGET } from '@/components/common/touch';
import { AssessmentForm } from '@/features/assessments';
import { ASSESSMENT_TYPE_LABELS_DE } from '@/features/assessments/components/labels';
import { ArchiveButton } from '@/features/athletes';
import { CaseForm, CaseList } from '@/features/cases';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Athlet',
};

/**
 * A stored figure with its unit, or an em dash.
 *
 * German decimal notation, matching the form: what the coach reads here is what
 * they would type back into the field. `heightCm` and `weightKg` are profile
 * values — the current figure a coach reads at a glance, not a measurement
 * series (§9).
 */
const formatFigure = (value: number | null, unit: string): string =>
  value === null ? '—' : `${value.toLocaleString('de-DE')} ${unit}`;

/**
 * The athlete's record — the coach's main working surface.
 *
 * Read top to bottom: who this is, what is known about them, which engagements
 * are open, and which examinations took place. That order is the hierarchy of
 * §3 (`Athlete → Performance Case → Assessment`) turned into a page, which is
 * also why Assessments live here and not in the main navigation.
 *
 * The lookup is tenant-scoped inside the procedure, so an id from another
 * workspace produces `NOT_FOUND` — indistinguishable from an id that never
 * existed, which is deliberate (docs/SECURITY.md §4).
 */
export default async function AthletePage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;

  const athlete = await api.athletes.byId({ athleteId }).catch((error: unknown) => {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });

  const [cases, assessments] = await Promise.all([
    api.cases.listForAthlete({ athleteId }),
    api.assessments.listForAthlete({ athleteId }),
  ]);

  /**
   * Which engagement an assessment belongs to.
   *
   * Derived from data both lists already carry — no query and no new concept.
   * Without it the two sections read as unrelated lists, and the chain
   * `Athlete → Case → Assessment` is invisible on the one page where it matters.
   */
  const caseTitles = new Map(cases.map((entry) => [entry.id, entry.title]));

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-10 px-6 py-12">
      <div className="flex flex-col gap-4">
        <Link
          href="/athletes"
          // The only way back to the roster, so it is a touch target rather
          // than a line of text. Measured at 375px: it was 20px tall.
          className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Athleten
        </Link>

        {/* The actions wrap below the name on a phone rather than squeezing it:
            `min-w-0` lets the name column shrink, `break-words` lets a long
            double surname wrap inside it. */}
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-3xl font-semibold break-words hyphens-auto" lang="de">
              {athlete.firstName} {athlete.lastName}
            </h1>

            {/* Wording, never colour alone — a badge a coach can only see is a
                badge a screen reader cannot. */}
            <div className="flex flex-wrap items-center gap-2">
              {athlete.archivedAt ? (
                <Badge variant="secondary">Deaktiviert</Badge>
              ) : (
                <Badge variant="accent">Aktiv</Badge>
              )}
              {athlete.userId ? <Badge variant="outline">Portalzugang</Badge> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className={TOUCH_BUTTON}>
              <Link href={`/athletes/${athlete.id}/edit`}>
                <Pencil aria-hidden="true" className="size-4" />
                Bearbeiten
              </Link>
            </Button>

            <ArchiveButton athleteId={athlete.id} archived={athlete.archivedAt !== null} />
          </div>
        </header>

        {/* Beside the badge that states it, not three screens below: a coach who
            reads "Deaktiviert" at the top should not have to scroll to learn
            what it means. */}
        {athlete.archivedAt ? (
          <p className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-pretty text-muted-foreground">
            Dieser Athlet ist deaktiviert. Es wurde nichts gelöscht — der Datensatz und seine
            Historie bleiben vollständig erhalten, und eine Reaktivierung stellt den vollen Zugriff
            wieder her.
          </p>
        ) : null}
      </div>

      <section aria-labelledby="master-data" className="flex flex-col gap-4">
        <h2 id="master-data" className="text-lg font-semibold">
          Stammdaten
        </h2>

        {/*
          A description list that stacks on a phone and pairs up from `sm`.
          The previous `grid-cols-[auto_1fr]` was a desktop table at every width:
          at 375px the label column ate a third of the row and every long e-mail
          wrapped into a narrow gutter beside it.
        */}
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Geburtsdatum" numeric>
            {athlete.dateOfBirth?.toLocaleDateString('de-DE') ?? '—'}
          </Fact>
          <Fact label="E-Mail">{athlete.email ?? '—'}</Fact>
          <Fact label="Telefon">{athlete.phone ?? '—'}</Fact>
          <Fact label="Größe" numeric>
            {formatFigure(athlete.heightCm, 'cm')}
          </Fact>
          <Fact label="Aktuelles Gewicht" numeric>
            {formatFigure(athlete.weightKg, 'kg')}
          </Fact>
          <Fact label="Angelegt" numeric>
            {athlete.createdAt.toLocaleDateString('de-DE')}
          </Fact>
          <Fact label="Portalzugang">
            {athlete.userId ? 'Mit einem Benutzerkonto verknüpft' : 'Kein Benutzerkonto verknüpft'}
          </Fact>
        </dl>

        {athlete.userId ? null : (
          <p className="text-xs text-pretty text-muted-foreground">
            Ein Athlet braucht kein Benutzerkonto (§21). Die Aktivierung kommt mit dem
            Athletenportal.
          </p>
        )}
      </section>

      <section aria-labelledby="cases" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="cases" className="text-lg font-semibold">
              Betreuungsfälle
            </h2>
            <p className="text-sm text-pretty text-muted-foreground">
              Ein Betreuungsfall bündelt die Assessments, die zu einer Fragestellung gehören.
            </p>
          </div>

          <CaseForm athleteId={athlete.id} />
        </div>

        <CaseList athleteId={athlete.id} cases={cases} />
      </section>

      <section aria-labelledby="assessments" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="assessments" className="text-lg font-semibold">
              Assessments
            </h2>
            <p className="text-sm text-pretty text-muted-foreground">
              Jedes Assessment beantwortet genau eine Frage und gehört zu einem Betreuungsfall.
            </p>
          </div>

          <AssessmentForm athleteId={athlete.id} />
        </div>

        {assessments.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-pretty text-muted-foreground">
            Noch kein Assessment. Der Betreuungsfall entsteht automatisch mit dem ersten (§8).
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {assessments.map((assessment) => (
              <li key={assessment.id}>
                <Link
                  href={`/assessments/${assessment.id}`}
                  className={`${FOCUS_RING} flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-border-strong`}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium break-words">{assessment.question}</span>
                    <span className="text-xs break-words text-muted-foreground">
                      <span data-numeric>{assessment.performedAt.toLocaleDateString('de-DE')}</span>
                      {' · '}
                      {assessment.modules.length}{' '}
                      {assessment.modules.length === 1 ? 'Test' : 'Tests'}
                      {caseTitles.has(assessment.caseId)
                        ? ` · ${caseTitles.get(assessment.caseId) ?? ''}`
                        : ''}
                    </span>
                  </span>

                  <Badge variant="secondary" className="shrink-0">
                    {ASSESSMENT_TYPE_LABELS_DE[assessment.type] ?? assessment.type}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/**
 * One labelled fact.
 *
 * `min-w-0` with `break-words` on the value: an e-mail address is the longest
 * unbroken string this page holds, and without both it widens its grid track
 * rather than wrapping inside it.
 */
function Fact({
  label,
  numeric,
  children,
}: {
  readonly label: string;
  readonly numeric?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className="min-w-0 text-sm break-words"
        {...(numeric === true ? { 'data-numeric': '' } : {})}
      >
        {children}
      </dd>
    </div>
  );
}
