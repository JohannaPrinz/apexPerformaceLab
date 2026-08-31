import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft, ChevronDown, Video } from 'lucide-react';

import { ageAt } from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_TARGET } from '@/components/common/touch';
import { AthleteSettingsMenu } from '@/features/athletes/components/athlete-settings-menu';
import { TrendCards } from '@/features/athletes/components/trend-cards';
import { ATHLETE_SEX_LABELS_DE } from '@/features/athletes/labels';
import { parseTrendCards, TREND_CARD_PARAM } from '@/features/athletes/trend-slots';
import { CaseDialog, CaseSection, NoCases, type CaseAssessment } from '@/features/cases';
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
export default async function AthletePage({
  params,
  searchParams,
}: {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<{
    cases?: string;
    assessments?: string;
    /** Which trends are on screen — see `trend-slots.ts`. Repeated. */
    card?: string | string[];
  }>;
}) {
  const { athleteId } = await params;

  /**
   * Whether closed and archived engagements are shown.
   *
   * Hidden by default: a coach opening an athlete wants what is running, and an
   * engagement from two seasons ago pushes it down the page. Nothing is lost —
   * §8 keeps closed cases part of the history, and one link brings them back.
   */
  const query = await searchParams;
  const showAll = query.cases === 'all';

  /**
   * Whether archived examinations are shown.
   *
   * Same rule and same mechanism as engagements — in the URL, so a reload and
   * the back button both keep it.
   */
  const showArchived = query.assessments === 'all';

  const athlete = await api.athletes.byId({ athleteId }).catch((error: unknown) => {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });

  // Read once, here: the age is derived from the date of birth on the day it is
  // shown, and never stored (`ageAt`).
  const age = ageAt(athlete.dateOfBirth, new Date());

  /**
   * Which two trends are on screen, read from the address bar.
   *
   * Worth keeping over a reload and worth sending to a colleague, and neither
   * needs a column. It is also the only place a server-rendered chart can read
   * a choice from without a round trip through client state.
   */
  // The address bar wins where it says something — that is how one particular
  // view is linked. Otherwise the profile opens with what the coach chose, which
  // is stored on the athlete.
  const linked = parseTrendCards(query[TREND_CARD_PARAM]);

  const [cases, assessments, trends, coaches, shares] = await Promise.all([
    // The status filter exists in the schema already; only the interface was
    // missing. `OPEN` alone is the working view.
    api.cases.listForAthlete({ athleteId, ...(showAll ? {} : { status: 'OPEN' as const }) }),
    api.assessments.listForAthlete({ athleteId, includeArchived: showArchived }),
    // Options and charts in one read, so a slot can never offer a quantity the
    // charts cannot fill.
    api.athletes.trends({
      athleteId,
      slots: linked.map((card) => ({ key: card.key, exerciseIds: [...card.exerciseIds] })),
    }),
    api.athletes.shareableCoaches(),
    api.athletes.shares({ athleteId }),
  ]);

  /**
   * The assessments of each engagement.
   *
   * Grouped from data the page already loads — no query and no new concept. The
   * chain `Athlete → Case → Assessment` (§3) becomes the shape of the page
   * rather than something a coach has to infer from two parallel lists.
   */
  // Which assessments an athlete can currently open through a link. One query
  // for the whole page — "who can see this" is a question about the roster.
  const sharedIds = new Set(await api.reports.sharedAssessments({ athleteId }));

  const byCase = new Map<string, CaseAssessment[]>();
  for (const assessment of assessments) {
    const entry = {
      id: assessment.id,
      question: assessment.question,
      type: assessment.type,
      performedAt: assessment.performedAt,
      testCount: assessment.modules.length,
      shared: sharedIds.has(assessment.id),
    };
    byCase.set(assessment.caseId, [...(byCase.get(assessment.caseId) ?? []), entry]);
  }

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-10 px-6 py-12">
      <div className="flex flex-col gap-4">
        <Link
          href="/athletes"
          // The only way back to the roster, so it is a touch target rather
          // than a line of text. Measured at 375px: it was 20px tall.
          className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
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
            {/* Analysing a video is a thing a coach *does* with an athlete,
                so it sits with the athlete rather than in the settings menu.
                The athlete is carried in as a suggestion and confirmed when the
                analysis is filed — arriving here and analysing somebody else's
                video is an ordinary mistake, and a silent assignment would hide
                it. The coach also picks the examination it belongs to there,
                which is how the analysis reaches a report. */}
            <Button asChild variant="accent" className={TOUCH_BUTTON}>
              <Link href={`/videoanalyse?athlete=${athlete.id}`}>
                <Video aria-hidden="true" className="size-4" />
                Videoanalyse
              </Link>
            </Button>

            <AthleteSettingsMenu
              athleteId={athlete.id}
              firstName={athlete.firstName}
              lastName={athlete.lastName}
              archived={athlete.archivedAt !== null}
              coaches={coaches}
              shares={shares}
            />
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

      {/* Collapsible, and open to begin with: the master data is what a coach
          checks first on arriving, and what they fold away once they are
          working. `<details>` rather than state, so the browser keeps it. */}
      <section aria-labelledby="master-data" className="flex flex-col gap-4">
        {/* `group` on the details, so the chevron can follow its open state.
            The marker is removed and replaced by an icon that turns: a browser
            run found the block looked like a plain heading, and a control
            nobody can see is a control nobody uses. */}
        <details open className="group">
          <summary
            className={`${TOUCH_TARGET} ${FOCUS_RING} flex w-fit cursor-pointer list-none items-center gap-2 rounded [&::-webkit-details-marker]:hidden`}
          >
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            />
            <h2 id="master-data" className="text-lg font-semibold">
              Stammdaten
            </h2>
            <span className="text-xs text-muted-foreground group-open:hidden">einblenden</span>
            <span className="hidden text-xs text-muted-foreground group-open:inline">
              ausblenden
            </span>
          </summary>

          {/*
          A description list that stacks on a phone and pairs up from `sm`.
          The previous `grid-cols-[auto_1fr]` was a desktop table at every width:
          at 375px the label column ate a third of the row and every long e-mail
          wrapped into a narrow gutter beside it.
        */}
          <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Fact label="Geburtsdatum" numeric>
              {athlete.dateOfBirth?.toLocaleDateString('de-DE') ?? '—'}
            </Fact>
            {/* Derived, never stored: an age written down is wrong the day after
              (`ageAt`). Shown beside the date it comes from, so it is obvious
              which of the two is the record. */}
            <Fact label="Alter" numeric>
              {age === null ? '—' : `${String(age)} Jahre`}
            </Fact>
            <Fact label="Geschlecht">{ATHLETE_SEX_LABELS_DE[athlete.sex]}</Fact>
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
              {athlete.userId
                ? 'Mit einem Benutzerkonto verknüpft'
                : 'Kein Benutzerkonto verknüpft'}
            </Fact>
          </dl>

          {athlete.userId ? null : (
            <p className="text-xs text-pretty text-muted-foreground">
              Ein Athlet braucht kein Benutzerkonto (§21). Die Aktivierung kommt mit dem
              Athletenportal.
            </p>
          )}
        </details>
      </section>

      {/* Under the master data, because it is the first thing a coach reads
          about an athlete after who they are. The cycle is one of the cards
          here — recording a bleeding and reading the log are one thing, so
          there is no separate section for it. */}
      <TrendCards
        athleteId={athleteId}
        options={trends.options}
        charts={trends.charts}
        cards={trends.slots.map((slot) => ({ key: slot.key, exerciseIds: slot.exerciseIds }))}
      />

      {/*
        One hierarchy, not two lists.
        `Athlete → Performance Case → Assessment` (§3) is what the model says,
        and the page used to contradict it by showing cases and assessments as
        siblings. Nesting them makes the case what it is — the bracket around a
        set of assessments — and gives "Assessment anlegen" a place where the
        engagement is unambiguous.
      */}
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

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href={athleteHref(athlete.id, {
                cases: showAll ? null : 'all',
                assessments: showArchived ? 'all' : null,
              })}
              className={`${FOCUS_RING} ${TOUCH_TARGET} inline-flex items-center rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
            >
              {showAll ? 'Nur laufende Fälle' : 'Abgeschlossene Fälle einblenden'}
            </Link>

            <Link
              href={athleteHref(athlete.id, {
                cases: showAll ? 'all' : null,
                assessments: showArchived ? null : 'all',
              })}
              className={`${FOCUS_RING} ${TOUCH_TARGET} inline-flex items-center rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
            >
              {showArchived ? 'Archivierte ausblenden' : 'Archivierte Assessments einblenden'}
            </Link>

            {cases.length === 0 ? null : <CaseDialog athleteId={athlete.id} />}
          </div>
        </div>

        {cases.length === 0 ? (
          <NoCases>
            <CaseDialog athleteId={athlete.id} />
          </NoCases>
        ) : (
          <div className="flex flex-col gap-4">
            {cases.map((performanceCase) => (
              <CaseSection
                key={performanceCase.id}
                performanceCase={performanceCase}
                athleteId={athlete.id}
                assessments={byCase.get(performanceCase.id) ?? []}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

/**
 * The athlete's page with a narrowing changed and the rest kept.
 *
 * Both toggles live in the URL, so flipping one must not silently drop the
 * other — the mistake a hand-built `?cases=all` link makes the moment a second
 * filter exists.
 */
function athleteHref(
  athleteId: string,
  narrowing: { cases: string | null; assessments: string | null },
): string {
  const query = new URLSearchParams();
  if (narrowing.cases !== null) query.set('cases', narrowing.cases);
  if (narrowing.assessments !== null) query.set('assessments', narrowing.assessments);
  const suffix = query.toString();

  return suffix === '' ? `/athletes/${athleteId}` : `/athletes/${athleteId}?${suffix}`;
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
