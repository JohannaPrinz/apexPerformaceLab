import type { ReportSnapshot } from '@apex/domain';

/**
 * A published analysis, as the athlete sees it.
 *
 * ## Read from the snapshot, never from the record
 *
 * Every number here was frozen at publication. A correction the coach enters
 * afterwards does not change this page — that is the point of §2: the document
 * an athlete was handed stays the document they were handed, and a later change
 * is a new version with a new link.
 *
 * ## What it deliberately does not show
 *
 * The question the assessment asked, which tests were set aside, how full the
 * examination was, and every control the workspace has. This is a document, not
 * a view of the application.
 */

const NUMBER = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const SIDE_WORDS: Readonly<Record<string, string>> = {
  LEFT: 'links',
  RIGHT: 'rechts',
  BILATERAL: 'beidseitig',
};

const withUnit = (value: number, unit: string) =>
  unit.trim() === '' ? NUMBER.format(value) : `${NUMBER.format(value)} ${unit}`;

function signed(value: number): string {
  if (value === 0) return '±0';

  return `${value > 0 ? '+' : '−'}${NUMBER.format(Math.abs(value))}`;
}

export function SharedReport({ snapshot }: { readonly snapshot: ReportSnapshot }) {
  const performedAt = new Date(snapshot.assessment.performedAt);

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Auswertung</span>
        <h1 className="text-2xl font-semibold text-pretty">
          {snapshot.athlete.firstName} {snapshot.athlete.lastName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Untersuchung vom <span data-numeric>{DATE.format(performedAt)}</span> · erstellt von{' '}
          {snapshot.coach.name}
        </p>
      </header>

      {snapshot.modules.map((entry) => (
        <section
          key={entry.moduleId}
          aria-label={entry.name}
          className="flex flex-col gap-4 rounded-md border border-border p-4"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-base font-semibold break-words">{entry.name}</h2>
            <span className="text-xs text-muted-foreground">{entry.typeLabel}</span>
            {entry.protocolLabel === null ? null : (
              <span className="text-xs text-muted-foreground">· {entry.protocolLabel}</span>
            )}
          </div>

          {entry.derivations.length === 0 ? null : (
            <p className="text-xs text-muted-foreground">
              Berechnet nach {entry.derivations.join(', ')}.
            </p>
          )}

          {entry.series.length === 0 ? null : (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-3 font-medium">Messgröße</th>
                    <th className="py-2 pr-3 font-medium">Gemessen</th>
                    <th className="py-2 pr-3 font-medium">Früher</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.series.map((row) => {
                    const label = [
                      row.exerciseName,
                      row.side === 'BILATERAL' ? null : (SIDE_WORDS[row.side] ?? row.side),
                      row.passIndex === null ? null : `Stufe ${String(row.passIndex)}`,
                      ...Object.values(row.context),
                    ]
                      .filter((part) => part !== null && part !== '')
                      .join(' · ');

                    return (
                      <tr key={row.key} className="border-b border-border align-top last:border-0">
                        <td className="py-2 pr-3">
                          <span className="font-medium break-words">{row.typeName}</span>
                          {label === '' ? null : (
                            <span className="block text-xs break-words text-muted-foreground">
                              {label}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3" data-numeric>
                          {withUnit(row.current.value, row.unit)}
                        </td>
                        <td className="py-2 pr-3" data-numeric>
                          {row.previous === null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <>
                              {withUnit(row.previous.value, row.unit)}
                              {row.difference === null ? null : (
                                <span className="block text-xs text-muted-foreground">
                                  {signed(row.difference)}
                                  {row.unit.trim() === '' ? '' : ` ${row.unit}`}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {entry.interpretation.trim() === '' ? null : (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">Einordnung</h3>
              <p className="max-w-prose text-sm text-pretty whitespace-pre-line">
                {entry.interpretation}
              </p>
            </div>
          )}

          {entry.recommendation.trim() === '' ? null : (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">Empfehlung</h3>
              <p className="max-w-prose text-sm text-pretty whitespace-pre-line">
                {entry.recommendation}
              </p>
            </div>
          )}
        </section>
      ))}

      {snapshot.overall.interpretation.trim() === '' &&
      snapshot.overall.recommendation.trim() === '' ? null : (
        <section
          aria-label="Gesamtauswertung"
          className="flex flex-col gap-3 border-t border-border pt-6"
        >
          <h2 className="text-lg font-semibold">Gesamtauswertung</h2>

          {snapshot.overall.interpretation.trim() === '' ? null : (
            <p className="max-w-prose text-sm text-pretty whitespace-pre-line">
              {snapshot.overall.interpretation}
            </p>
          )}

          {snapshot.overall.recommendation.trim() === '' ? null : (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">Empfehlung</h3>
              <p className="max-w-prose text-sm text-pretty whitespace-pre-line">
                {snapshot.overall.recommendation}
              </p>
            </div>
          )}
        </section>
      )}
    </article>
  );
}
