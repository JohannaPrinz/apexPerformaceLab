import Link from 'next/link';

import { ArrowRight, FolderOpen } from 'lucide-react';

import { ageAt } from '@apex/domain';

import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';
import { ATHLETE_SEX_LABELS_DE } from '@/features/athletes/labels';
import { MONTH_PARAM, parseMonth, startOfMonth } from '@/features/athletes/month';
import { parseWeek, startOfWeek, WEEK_PARAM } from '@/features/athletes/week';
import { PortalTracking } from '@/features/portal/components/portal-tracking';
import { ReadOnlyNotice } from '@/features/portal/components/read-only-notice';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mein Bereich',
};

/**
 * What an athlete sees of their own record (§21).
 *
 * ## No athlete in the address
 *
 * That is the point of the route. Every read below resolves the record from the
 * session, so there is no parameter to change and therefore no other athlete to
 * reach — the guarantee is structural rather than checked.
 *
 * ## Why the master data is shown and not editable
 *
 * Height, weight, sex and date of birth are inputs to the body-density
 * equations and the strength standards; a value the athlete could change on
 * their own would move the ground under findings the coach has signed (§21).
 * They report a weight the way they report everything else here — as a tracking
 * entry, marked as self-reported.
 *
 * ## Why only the cards the coach chose
 *
 * Which quantities are worth following is a coaching decision. The portal
 * renders the cards that are on the profile; adding one of its own would
 * overrule the coach from the other side.
 */
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const week = parseWeek(query[WEEK_PARAM]) ?? startOfWeek(new Date());
  const month = parseMonth(query[MONTH_PARAM]) ?? startOfMonth(new Date());

  const me = await api.portal.me();
  const cards = new Set(me.cards);
  const reports = await api.portal.sharedReports();

  // Only what is on the profile is read, so a card the coach did not choose
  // costs nothing rather than being loaded and thrown away.
  const [nutrition, biofeedback, cycle] = await Promise.all([
    cards.has('nutrition') ? api.portal.nutritionWeek({ weekStart: week }) : Promise.resolve(null),
    cards.has('biofeedback')
      ? api.portal.biofeedbackWeek({ weekStart: week })
      : Promise.resolve(null),
    cards.has('cycle')
      ? api.portal.cycleMonth({ month: month.toISOString().slice(0, 10) })
      : Promise.resolve(null),
  ]);

  const age = me.dateOfBirth === null ? null : ageAt(me.dateOfBirth, new Date());
  const nothingToTrack = nutrition === null && biofeedback === null && cycle === null;

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-pretty">
          {me.firstName} {me.lastName}
        </h1>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          Hier tragen Sie Ihre eigenen Werte ein. Ihr Coach sieht sie unmittelbar, und es ist
          gekennzeichnet, dass sie von Ihnen kommen.
        </p>
      </header>

      {/* Read-only is a state of the account, not a screen: the writes below
          refuse in the procedure. Saying so here means nobody types into a
          field and wonders why it did not stick. */}
      {me.archivedAt === null ? null : (
        <ReadOnlyNotice>neue Einträge sind nicht mehr möglich.</ReadOnlyNotice>
      )}

      <section aria-labelledby="my-data" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="my-data" className="text-lg font-semibold">
            Meine Daten
          </h2>
          <p className="max-w-prose text-xs text-pretty text-muted-foreground">
            Diese Angaben pflegt Ihr Coach — sie gehen in seine Berechnungen ein. Wenn etwas nicht
            stimmt, sagen Sie ihm Bescheid.
          </p>
        </div>

        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Geburtsdatum" numeric>
            {me.dateOfBirth?.toLocaleDateString('de-DE') ?? '—'}
          </Fact>
          <Fact label="Alter" numeric>
            {age === null ? '—' : `${String(age)} Jahre`}
          </Fact>
          <Fact label="Geschlecht">{ATHLETE_SEX_LABELS_DE[me.sex]}</Fact>
          <Fact label="E-Mail">{me.email ?? '—'}</Fact>
          <Fact label="Telefon">{me.phone ?? '—'}</Fact>
          <Fact label="Größe" numeric>
            {me.heightCm === null ? '—' : `${figure(me.heightCm)} cm`}
          </Fact>
          <Fact label="Gewicht" numeric>
            {me.weightKg === null ? '—' : `${figure(me.weightKg)} kg`}
          </Fact>
        </dl>
      </section>

      {/* Above the tracking, because this is what an athlete comes for after an
          examination — and what they were previously sent to an old e-mail and
          a second password to find. */}
      <section aria-labelledby="my-reports" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="my-reports" className="text-lg font-semibold">
            Meine Auswertungen
          </h2>
          <p className="max-w-prose text-xs text-pretty text-muted-foreground">
            Was Ihr Coach für Sie freigegeben hat. Sie können jede Auswertung als PDF speichern.
          </p>
        </div>

        {reports.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-pretty text-muted-foreground">
            Es ist noch keine Auswertung für Sie freigegeben.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reports.map((report) => (
              <li key={report.id}>
                <Link
                  href={`/portal/auswertungen/${report.id}`}
                  className={`${FOCUS_RING} ${TOUCH_TARGET} flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md border border-border bg-card px-4 py-3 hover:bg-muted`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">{report.title}</span>
                    {report.question === null ? null : (
                      <span className="text-xs text-muted-foreground">{report.question}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-3">
                    {report.performedAt === null ? null : (
                      <span className="text-xs text-muted-foreground" data-numeric>
                        Untersuchung {report.performedAt.toLocaleDateString('de-DE')}
                      </span>
                    )}
                    <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="my-files" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="my-files" className="text-lg font-semibold">
            Meine Dateien
          </h2>
          <p className="max-w-prose text-xs text-pretty text-muted-foreground">
            Dokumente, Fotos und Videos — etwa eine Aufnahme für den Formcheck. Ihr Coach sieht
            dieselbe Ablage.
          </p>
        </div>

        <Link
          href="/portal/dateien"
          className={`${FOCUS_RING} ${TOUCH_TARGET} flex w-fit items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-muted`}
        >
          <FolderOpen aria-hidden="true" className="size-4 text-muted-foreground" />
          Dateien öffnen
        </Link>
      </section>

      <section aria-labelledby="my-tracking" className="flex flex-col gap-4">
        <h2 id="my-tracking" className="text-lg font-semibold">
          Mein Tracking
        </h2>

        {nothingToTrack ? (
          <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-pretty text-muted-foreground">
            Ihr Coach hat noch keine Kacheln für Sie eingerichtet. Sobald das geschehen ist, tragen
            Sie hier Ihre Werte ein.
          </p>
        ) : (
          <PortalTracking
            nutrition={nutrition}
            biofeedback={biofeedback}
            cycle={cycle}
            readOnly={me.archivedAt !== null}
          />
        )}
      </section>
    </>
  );
}

/** A German decimal, without a trailing zero nobody measured. */
const figure = (value: number): string =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(value);

function Fact({
  label,
  numeric = false,
  children,
}: {
  readonly label: string;
  readonly numeric?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm" {...(numeric ? { 'data-numeric': true } : {})}>
        {children}
      </dd>
    </div>
  );
}
