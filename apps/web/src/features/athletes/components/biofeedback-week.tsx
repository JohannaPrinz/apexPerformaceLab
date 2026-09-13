'use client';

import { useState, useTransition } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { ChevronLeft, ChevronRight, MessageSquare, Plus, X } from 'lucide-react';

import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_TARGET } from '@/components/common/touch';

import { formatWeek, shiftWeek, WEEK_PARAM } from '../week';

import type { WriteOutcome } from './writes';

/**
 * What an athlete reports about their own day, a week at a time.
 *
 * ## Why the quantities are the rows and the days the columns
 *
 * The other way round — the shape the nutrition week uses — works there because
 * that table has five fixed quantities. This one starts with eight and the
 * coach adds their own, so quantities across the top would make the table wider
 * every time somebody tracks one more thing, while seven days stay seven days.
 * Rows also give each quantity its name in full at the left, which a column
 * header cannot do without wrapping.
 *
 * ## What is computed
 *
 * The plain mean of the days that carry a value, per quantity, and **the number
 * of days it came from beside it** — a mean over three days is not a week.
 * Nothing else. Every figure here is a self-report on a scale the athlete and
 * the coach agreed between themselves; the platform has no definition of a 7
 * for stress and therefore says nothing about one.
 *
 * ## The remark
 *
 * On the value it explains — three hours of sleep and the reason for them are
 * one entry. It follows that the remark needs a value first, which is why the
 * button appears on filled cells only.
 *
 * ## Who may write
 *
 * The coach, today. Entries carry `recordedBy` and the table marks an athlete's
 * own figures, so the athlete's side is a login away once the portal exists
 * (§21) — it does not yet, and there is no athlete path here pretending
 * otherwise.
 */

/**
 * What this table writes, and what it may configure.
 *
 * No athlete is named anywhere in it: whoever supplies these has already
 * decided whose record is written — the coach's page by binding an id, the
 * portal by resolving one from the session (§21).
 *
 * `configure` is separate and optional because it is a different kind of act.
 * Choosing *which* quantities an athlete follows is a coaching decision; filling
 * them in is the athlete's. Where it is absent the controls go with it.
 */
export interface BiofeedbackWrites {
  readonly setValue: (key: string, day: Date, value: number) => Promise<WriteOutcome>;
  readonly clearValue: (entryId: string) => Promise<WriteOutcome>;
  readonly setNote: (entryId: string, note: string | null) => Promise<WriteOutcome>;
  readonly configure?:
    | {
        readonly setRows: (keys: readonly string[]) => Promise<WriteOutcome>;
        readonly addQuantity: (name: string) => Promise<WriteOutcome>;
      }
    | undefined;
}

export interface BiofeedbackQuantityView {
  readonly key: string;
  readonly name: string;
  readonly unit: string;
  readonly ownedByWorkspace: boolean;
}

export interface BiofeedbackCellView {
  readonly entryId: string;
  readonly value: number;
  readonly note: string | null;
  readonly recordedBy: 'ATHLETE' | 'COACH';
}

export interface BiofeedbackRowView {
  readonly quantity: BiofeedbackQuantityView;
  readonly cells: readonly (BiofeedbackCellView | null)[];
  readonly average: { readonly value: number; readonly days: number } | null;
}

export interface BiofeedbackWeekView {
  readonly weekStart: Date;
  readonly days: readonly Date[];
  readonly rows: readonly BiofeedbackRowView[];
  readonly available: readonly BiofeedbackQuantityView[];
}

const weekday = (value: Date): string =>
  new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' }).format(value);

const shortDate = (value: Date): string =>
  new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(
    value,
  );

const longDate = (value: Date): string =>
  new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'UTC' }).format(value);

const decimal = (value: number, digits = 1): string =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }).format(value);

const forInput = (cell: BiofeedbackCellView | null): string =>
  cell === null ? '' : decimal(cell.value, 2);

export function BiofeedbackWeek({
  week,
  writes,
  onRemove,
  readOnly = false,
}: {
  readonly week: BiofeedbackWeekView;
  readonly writes: BiofeedbackWrites;
  /** Absent where the card cannot be taken off the page — the portal. */
  readonly onRemove?: (() => void) | undefined;
  /**
   * A deactivated athlete's portal: the week stays readable, the fields go.
   *
   * Defaults to false, so the coach's page is exactly what it was. The writes
   * behind it refuse on their own either way — `writable()` in the procedure —
   * and this only stops somebody typing into a field that cannot keep it. The
   * remark travels with the value, so it is shown rather than edited.
   */
  readonly readOnly?: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  /** Which cell's remark is open, as `key|dayIndex`. One at a time. */
  const [openNote, setOpenNote] = useState<string | null>(null);

  const goto = (weeks: number) => {
    const params = new URLSearchParams(search.toString());
    params.set(WEEK_PARAM, formatWeek(shiftWeek(week.weekStart, weeks)));
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const shown = week.rows.map((row) => row.quantity.key);

  const configure = writes.configure;

  const setRows = (keys: readonly string[]) => {
    if (configure === undefined) return;
    setError(null);
    startTransition(async () => {
      const result = await configure.setRows(keys);
      if (result.message) setError(result.message);
      else router.refresh();
    });
  };

  const addOwn = () => {
    const name = newName.trim();
    if (name === '') return;

    if (configure === undefined) return;
    setError(null);
    startTransition(async () => {
      const result = await configure.addQuantity(name);
      if (result.message) setError(result.message);
      else {
        setNewName('');
        setAdding(false);
        router.refresh();
      }
    });
  };

  const last = week.days.at(-1);

  return (
    <section
      aria-labelledby="biofeedback-week"
      className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id="biofeedback-week" className="text-sm font-medium">
            Biofeedback
          </h3>
          <p className="text-xs text-muted-foreground" data-numeric>
            {longDate(week.weekStart)}
            {last === undefined ? '' : ` – ${longDate(last)}`}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className={TOUCH_BUTTON}
            aria-label="Vorherige Woche"
            onClick={() => {
              goto(-1);
            }}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={TOUCH_BUTTON}
            aria-label="Nächste Woche"
            onClick={() => {
              goto(1);
            }}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
          {onRemove === undefined ? null : (
            <button
              type="button"
              aria-label="Biofeedback entfernen"
              onClick={onRemove}
              className={`${FOCUS_RING} ${TOUCH_TARGET} flex items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:text-foreground`}
            >
              <X aria-hidden="true" className="size-3.5" />
              Entfernen
            </button>
          )}
        </div>
      </div>

      {week.rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
          Diese Tabelle hat keine Zeilen mehr. Unten lässt sich wieder eine aufnehmen.
        </p>
      ) : (
        /* Its own scroller: eight columns of numbers do not fit a 375px screen,
           and the page body must never scroll sideways because of one table. */
        <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <caption className="sr-only">
              Biofeedback je Tag der Woche ab {longDate(week.weekStart)}
            </caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="py-2 pr-3 text-xs font-medium text-muted-foreground">
                  Messgröße
                </th>
                {week.days.map((day) => (
                  <th
                    key={day.toISOString()}
                    scope="col"
                    className="px-1.5 py-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    {weekday(day)}
                    <span className="block font-normal" data-numeric>
                      {shortDate(day)}
                    </span>
                  </th>
                ))}
                <th
                  scope="col"
                  className="px-1.5 py-2 text-right text-xs font-medium text-muted-foreground"
                >
                  Durchschnitt
                </th>
                <th scope="col" className="w-8">
                  <span className="sr-only">Zeile entfernen</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {week.rows.map((row) => (
                <tr key={row.quantity.key} className="border-b border-border/60 align-top">
                  <th
                    scope="row"
                    className="py-1 pr-3 text-left font-normal whitespace-nowrap sm:pt-3"
                  >
                    {row.quantity.name}
                    <span className="block text-xs text-muted-foreground">{row.quantity.unit}</span>
                  </th>

                  {row.cells.map((cell, index) => {
                    const day = week.days[index];
                    if (day === undefined) return null;
                    const id = `${row.quantity.key}|${String(index)}`;

                    return (
                      <td key={day.toISOString()} className="px-1.5 py-1">
                        {readOnly ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <p className="text-center text-sm" data-numeric>
                              {cell === null ? '—' : decimal(cell.value, 2)}
                            </p>
                            {cell?.note === null || cell === null ? null : (
                              <p className="max-w-32 text-center text-[11px] text-pretty text-muted-foreground">
                                {cell.note}
                              </p>
                            )}
                          </div>
                        ) : (
                          <Cell
                            writes={writes}
                            day={day}
                            quantity={row.quantity}
                            cell={cell}
                            noteOpen={openNote === id}
                            onToggleNote={() => {
                              setOpenNote((previous) => (previous === id ? null : id));
                            }}
                            onError={setError}
                          />
                        )}
                      </td>
                    );
                  })}

                  <td className="px-1.5 py-1 text-right text-xs sm:pt-3" data-numeric>
                    {row.average === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        <span className="font-medium">{decimal(row.average.value)}</span>{' '}
                        {/* How many days the mean is drawn from. A mean over
                            three days is not a week, and a bare number would be
                            read as one. */}
                        <span className="block text-muted-foreground">
                          aus {row.average.days} {row.average.days === 1 ? 'Tag' : 'Tagen'}
                        </span>
                      </>
                    )}
                  </td>

                  <td className="py-1 sm:pt-3">
                    {configure === undefined ? null : (
                      <button
                        type="button"
                        aria-label={`Zeile ${row.quantity.name} entfernen`}
                        disabled={pending}
                        onClick={() => {
                          setRows(shown.filter((key) => key !== row.quantity.key));
                        }}
                        className={`${FOCUS_RING} ${TOUCH_TARGET} rounded px-1 text-muted-foreground hover:text-destructive`}
                      >
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Taking a row off never deletes what was written under it — the entries
          stay and reappear the moment the row is back. Said here, because a
          cross beside a row of numbers reads like a delete. */}
      {configure === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {week.available.map((quantity) => (
            <button
              key={quantity.key}
              type="button"
              disabled={pending}
              onClick={() => {
                setRows([...shown, quantity.key]);
              }}
              className={`${FOCUS_RING} ${TOUCH_TARGET} flex items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-50`}
            >
              <Plus aria-hidden="true" className="size-3.5" />
              {quantity.name}
            </button>
          ))}

          {adding ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
                <span className="font-medium">Eigene Messgröße</span>
                <input
                  value={newName}
                  placeholder="z. B. Wohlbefinden"
                  autoFocus
                  disabled={pending}
                  onChange={(event) => {
                    setNewName(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addOwn();
                  }}
                  className={`${FOCUS_RING} h-11 w-full rounded-md border border-input bg-background px-3 text-sm`}
                />
              </label>
              <Button
                type="button"
                variant="accent"
                className={TOUCH_BUTTON}
                disabled={pending || newName.trim() === ''}
                onClick={addOwn}
              >
                Hinzufügen
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={TOUCH_BUTTON}
                onClick={() => {
                  setAdding(false);
                  setNewName('');
                }}
              >
                Abbrechen
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
              }}
              className={`${FOCUS_RING} ${TOUCH_TARGET} flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground`}
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Eigene Messgröße
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-pretty text-muted-foreground">
        Bewertungen von 1 bis 10, Schlaf in Stunden.
        {configure === undefined
          ? ' Was eine 7 bedeutet, legen Sie mit Ihrem Coach fest — es findet keine fachliche Bewertung statt. Eine Bemerkung erklärt einen Wert, wenn die Zahl allein zu wenig sagt.'
          : ' Was eine 7 bedeutet, legen Sie mit dem Athleten fest — es findet keine fachliche Bewertung statt. Eine entfernte Zeile löscht nichts: eingetragene Werte bleiben und erscheinen wieder, sobald die Zeile zurückkommt. Eine eigene Messgröße gehört danach dem Arbeitsbereich und steht auch bei anderen Athleten zur Wahl.'}
      </p>

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * One cell: the figure, and the remark that explains it.
 *
 * Written on blur rather than on every keystroke — a coach typing "10" would
 * otherwise store 1 and then 10, and each of those is a saved statement about
 * somebody's day. Emptying the field removes the entry, which is a different
 * act from writing a zero.
 */
function Cell({
  writes,
  day,
  quantity,
  cell,
  noteOpen,
  onToggleNote,
  onError,
}: {
  readonly writes: BiofeedbackWrites;
  readonly day: Date;
  readonly quantity: BiofeedbackQuantityView;
  readonly cell: BiofeedbackCellView | null;
  readonly noteOpen: boolean;
  readonly onToggleNote: () => void;
  readonly onError: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(() => forInput(cell));
  const [saved, setSaved] = useState(() => forInput(cell));
  const [note, setNote] = useState(() => cell?.note ?? '');

  // A value written elsewhere — another cell's save refreshes the page — must
  // reach a field the coach is not editing.
  const current = forInput(cell);
  if (current !== saved && draft === saved) {
    setSaved(current);
    setDraft(current);
  }

  const commit = () => {
    if (draft.trim() === saved.trim()) return;
    onError(null);

    if (draft.trim() === '') {
      if (cell === null) return;

      startTransition(async () => {
        const result = await writes.clearValue(cell.entryId);
        if (result.message) onError(result.message);
        else setSaved('');
      });

      return;
    }

    // A German keyboard produces a comma, and refusing that would be refusing
    // the coach's own keyboard.
    const parsed = Number(draft.replace(',', '.'));

    if (!Number.isFinite(parsed) || parsed < 0) {
      onError(`${quantity.name}: bitte eine Zahl eintragen.`);
      setDraft(saved);

      return;
    }

    startTransition(async () => {
      const result = await writes.setValue(quantity.key, day, parsed);
      if (result.message) {
        onError(result.message);
        setDraft(saved);
      } else {
        setSaved(draft);
      }
    });
  };

  const commitNote = () => {
    if (cell === null) return;
    onError(null);

    startTransition(async () => {
      const result = await writes.setNote(cell.entryId, note.trim() === '' ? null : note);

      if (result.message) onError(result.message);
      else onToggleNote();
    });
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        inputMode="decimal"
        value={draft}
        aria-label={`${quantity.name} am ${longDate(day)}${
          quantity.unit === '' ? '' : ` in ${quantity.unit}`
        }`}
        title={
          cell === null
            ? undefined
            : `${cell.recordedBy === 'ATHLETE' ? 'Vom Athleten' : 'Vom Coach'} eingetragen${
                cell.note === null ? '' : ` · ${cell.note}`
              }`
        }
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className={`${FOCUS_RING} h-11 w-full min-w-14 rounded-md border bg-background px-2 text-center text-sm disabled:opacity-50 ${
          cell?.recordedBy === 'ATHLETE' ? 'border-accent/60' : 'border-input'
        }`}
        data-numeric
      />

      {/* Only on a filled cell: a remark explains a value, and there is nowhere
          to put one that explains nothing. */}
      {cell === null ? null : (
        <button
          type="button"
          aria-label={`Bemerkung zu ${quantity.name} am ${longDate(day)}`}
          aria-expanded={noteOpen}
          onClick={onToggleNote}
          className={`${FOCUS_RING} flex h-6 items-center gap-1 rounded px-1 text-[10px] ${
            cell.note === null
              ? 'text-muted-foreground/60 hover:text-foreground'
              : 'text-accent-soft-foreground'
          }`}
        >
          <MessageSquare aria-hidden="true" className="size-3" />
          {cell.note === null ? 'Bemerkung' : 'Bemerkt'}
        </button>
      )}

      {cell === null || !noteOpen ? null : (
        <div className="flex w-48 flex-col gap-1 rounded-md border border-border bg-background p-2">
          <label className="flex flex-col gap-1 text-[10px]">
            <span className="text-muted-foreground">
              Bemerkung — {quantity.name}, {shortDate(day)}
            </span>
            <textarea
              value={note}
              rows={3}
              autoFocus
              maxLength={500}
              placeholder="z. B. spät ins Bett"
              onChange={(event) => {
                setNote(event.target.value);
              }}
              className={`${FOCUS_RING} w-full rounded border border-input bg-background p-1.5 text-xs`}
            />
          </label>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              disabled={pending}
              onClick={commitNote}
              className={`${FOCUS_RING} h-8 flex-1 rounded-md bg-accent px-2 text-xs text-accent-foreground disabled:opacity-50`}
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={() => {
                setNote(cell.note ?? '');
                onToggleNote();
              }}
              className={`${FOCUS_RING} h-8 rounded-md border border-border px-2 text-xs`}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
