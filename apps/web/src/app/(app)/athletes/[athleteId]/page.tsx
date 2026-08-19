import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@apex/ui';

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
 * Athlete detail.
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

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href="/athletes" className="text-xs text-muted-foreground hover:underline">
            ← Athleten
          </Link>
          <h1 className="text-3xl font-semibold">
            {athlete.firstName} {athlete.lastName}
          </h1>
          <div className="flex items-center gap-2">
            {athlete.archivedAt ? (
              <Badge variant="secondary">Deaktiviert</Badge>
            ) : (
              <Badge variant="accent">Aktiv</Badge>
            )}
            {athlete.userId ? <Badge variant="outline">Portalzugang</Badge> : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/athletes/${athlete.id}/edit`}>Bearbeiten</Link>
          </Button>

          <ArchiveButton athleteId={athlete.id} archived={athlete.archivedAt !== null} />
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stammdaten</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Geburtsdatum</dt>
              <dd data-numeric>{athlete.dateOfBirth?.toLocaleDateString('de-DE') ?? '—'}</dd>
              <dt className="text-muted-foreground">E-Mail</dt>
              <dd>{athlete.email ?? '—'}</dd>
              <dt className="text-muted-foreground">Telefon</dt>
              <dd>{athlete.phone ?? '—'}</dd>
              <dt className="text-muted-foreground">Größe</dt>
              <dd data-numeric>{formatFigure(athlete.heightCm, 'cm')}</dd>
              <dt className="text-muted-foreground">Aktuelles Gewicht</dt>
              <dd data-numeric>{formatFigure(athlete.weightKg, 'kg')}</dd>
              <dt className="text-muted-foreground">Angelegt</dt>
              <dd data-numeric>{athlete.createdAt.toLocaleDateString('de-DE')}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Portalzugang</CardTitle>
            <CardDescription>
              Ein Athlet braucht kein Benutzerkonto (§21). Die Aktivierung kommt mit dem
              Athletenportal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {athlete.userId
                ? 'Mit einem Benutzerkonto verknüpft.'
                : 'Kein Benutzerkonto verknüpft.'}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Verlauf</span>
            <h2 className="text-xl font-semibold">Betreuungsfälle</h2>
          </div>

          <CaseForm athleteId={athlete.id} />
        </div>

        <CaseList athleteId={athlete.id} cases={cases} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Assessments</span>
            <h2 className="text-xl font-semibold">Untersuchungen</h2>
          </div>

          <AssessmentForm athleteId={athlete.id} />
        </div>

        {assessments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch kein Assessment. Der Betreuungsfall entsteht automatisch mit dem ersten (§8).
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {assessments.map((assessment) => (
              <li key={assessment.id}>
                <Link
                  href={`/assessments/${assessment.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-border-strong"
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-pretty">{assessment.question}</span>
                    <span className="text-xs text-muted-foreground" data-numeric>
                      {assessment.performedAt.toLocaleDateString('de-DE')} ·{' '}
                      {assessment.modules.length}{' '}
                      {assessment.modules.length === 1 ? 'Test' : 'Tests'}
                    </span>
                  </span>

                  <Badge variant="secondary">
                    {ASSESSMENT_TYPE_LABELS_DE[assessment.type] ?? assessment.type}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {athlete.archivedAt ? (
        <p className="text-sm text-pretty text-muted-foreground">
          Dieser Athlet ist deaktiviert. Es wurde nichts gelöscht — der Datensatz und seine Historie
          bleiben vollständig erhalten, und eine Reaktivierung stellt den vollen Zugriff wieder her.
        </p>
      ) : null}
    </main>
  );
}
