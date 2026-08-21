'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { Plus } from 'lucide-react';

import { MEASUREMENT_TEMPLATES, MODULE_KEYS, type ModuleKey } from '@apex/domain';
import { Button, Dialog, DialogContent, DialogFooter, DialogTrigger } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';

import { addConfiguredModuleAction, addModuleAction } from '../server/actions';

import { ExercisePicker } from './exercise-picker';
import { MODULE_LABELS_DE } from './labels';

/**
 * Adding a test without leaving the assessment.
 *
 * ## What it asks, and what it does not
 *
 * Name, type, template, exercises. Everything else — passes, sides, dimensions,
 * protocol notes — sits behind "Weitere Einstellungen", because a test built on
 * a template needs none of it and that is the ordinary case. The two fields
 * that *are* behind the disclosure are the two the configuration genuinely
 * needs; the rest of the builder stays on its own route, which is where a
 * per-joint mobility screen belongs.
 *
 * ## Name and type are different things
 *
 * A diagnostic session records "Laufen – Laktat", "Laufen – Sprint" and
 * "Laufen – Ausdauer": one type, three tests. The name is what tells them
 * apart, so it is asked first and the type is a plain choice below it. A
 * template proposes a name; the coach overwrites it or does not.
 */
export interface SelectableExercise {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  /** `WORKSPACE` for an exercise this workspace owns, `SYSTEM` for the catalogue. */
  readonly scope: string;
}

export function CreateTestDialog({
  assessmentId,
  exercises,
}: {
  readonly assessmentId: string;
  /**
   * The exercises this workspace may use, already resolved by the page through
   * the ordinary exercise procedure — catalogue plus this workspace's own, and
   * never another tenant's. This dialog does not query and does not filter by
   * ownership; it only lets the coach pick from what they were given.
   */
  readonly exercises: readonly SelectableExercise[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [moduleKey, setModuleKey] = useState<string>(MODULE_KEYS[0]);
  const [templateKey, setTemplateKey] = useState('');
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [passes, setPasses] = useState(1);
  const [recordsSide, setRecordsSide] = useState(false);

  const templates = MEASUREMENT_TEMPLATES.filter((template) => template.moduleKey === moduleKey);
  const typeLabel = MODULE_LABELS_DE[moduleKey as ModuleKey] ?? moduleKey;
  const effectiveName = name.trim() === '' ? typeLabel : name.trim();

  function reset() {
    setName('');
    setTemplateKey('');
    setChosen([]);
    setAdvanced(false);
    setPasses(1);
    setRecordsSide(false);
    setError(null);
  }

  function submit() {
    setError(null);
    setPending(true);

    // A template carries its own measurements, so the template path is used
    // whenever one is chosen. Without a template the test is assembled here
    // from what the coach picked — the same shape the builder produces.
    const run = templateKey
      ? addModuleAction(assessmentId, effectiveName, moduleKey, templateKey)
      : addConfiguredModuleAction(assessmentId, effectiveName, moduleKey, {
          measurementTypes: [],
          exerciseIds: [...chosen],
          passes,
          recordsSide,
          dimensions: [],
        });

    void run
      .then((result) => {
        if (result.message) {
          setError(result.message);

          return;
        }

        setOpen(false);
        reset();
        router.refresh();
      })
      .finally(() => {
        setPending(false);
      });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="accent" className={TOUCH_BUTTON}>
          <Plus aria-hidden="true" className="size-4" />
          Test hinzufügen
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Test hinzufügen"
        description="Name und Typ genügen. Alles Weitere lässt sich später ändern."
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="testName" className="text-sm font-medium">
              Name des Tests
            </label>
            <input
              id="testName"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder={typeLabel}
              className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm`}
            />
            <p className="text-xs text-muted-foreground">
              Der Name unterscheidet mehrere Tests desselben Typs.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="testType" className="text-sm font-medium">
                Testtyp
              </label>
              <select
                id="testType"
                value={moduleKey}
                onChange={(event) => {
                  setModuleKey(event.target.value);
                  setTemplateKey('');
                }}
                className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm`}
              >
                {MODULE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {MODULE_LABELS_DE[key]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="testTemplate" className="text-sm font-medium">
                Vorlage
              </label>
              <select
                id="testTemplate"
                value={templateKey}
                onChange={(event) => {
                  const next = event.target.value;
                  setTemplateKey(next);

                  // A template proposes the name only while the coach has not
                  // written one — never overwriting what they typed.
                  const template = MEASUREMENT_TEMPLATES.find((entry) => entry.key === next);
                  if (template && name.trim() === '') setName(template.name);
                }}
                disabled={templates.length === 0}
                className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm disabled:opacity-50`}
              >
                <option value="">
                  {templates.length === 0 ? 'Keine Vorlage verfügbar' : 'Ohne Vorlage'}
                </option>
                {templates.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {templateKey === '' ? (
            <ExercisePicker
              exercises={exercises}
              chosen={chosen}
              onToggle={(id) => {
                setChosen((previous) =>
                  previous.includes(id)
                    ? previous.filter((entry) => entry !== id)
                    : [...previous, id],
                );
              }}
            />
          ) : (
            <p className="rounded-md border border-border bg-muted px-3 py-2.5 text-sm text-pretty text-muted-foreground">
              Die Vorlage bringt ihre Messgrößen mit. Übungen und Feineinstellungen lassen sich
              danach über „Konfigurieren“ anpassen.
            </p>
          )}

          {/* Progressive disclosure: two fields, and only the two the
              configuration actually needs. Everything else stays in the
              builder, where a per-joint screen belongs. */}
          {templateKey === '' ? (
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <button
                type="button"
                aria-expanded={advanced}
                onClick={() => {
                  setAdvanced((previous) => !previous);
                }}
                className={`${TOUCH_TARGET} ${FOCUS_RING} -ml-2 flex w-fit items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
              >
                Weitere Einstellungen
                <span aria-hidden="true">{advanced ? '▴' : '▾'}</span>
              </button>

              {advanced ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor="passes" className="text-sm font-medium">
                      Durchgänge
                    </label>
                    <input
                      id="passes"
                      type="number"
                      min={1}
                      max={50}
                      value={passes}
                      onChange={(event) => {
                        setPasses(Math.max(1, Number(event.target.value) || 1));
                      }}
                      className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm`}
                      data-numeric
                    />
                    <p className="text-xs text-muted-foreground">
                      Wie oft der gesamte Satz erfasst wird — bei einem Stufentest die Anzahl der
                      Stufen.
                    </p>
                  </div>

                  {/* The hit area is the whole label, not the 16px box:
                      a checkbox measures below every touch guidance, and
                      enlarging the box itself would look wrong. */}
                  <label
                    className={`${TOUCH_TARGET} flex cursor-pointer items-start gap-2 rounded-md py-2 text-sm sm:pt-7`}
                  >
                    <input
                      type="checkbox"
                      checked={recordsSide}
                      onChange={(event) => {
                        setRecordsSide(event.target.checked);
                      }}
                      className="mt-0.5 size-4 rounded border-input"
                    />
                    <span className="min-w-0">
                      Jeden Wert je Seite erfassen
                      <span className="block text-xs text-muted-foreground">
                        Für Tests, bei denen links gegen rechts der Vergleich ist.
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          <Summary
            name={effectiveName}
            typeLabel={typeLabel}
            templateName={
              MEASUREMENT_TEMPLATES.find((entry) => entry.key === templateKey)?.name ?? null
            }
            exerciseCount={chosen.length}
            passes={passes}
          />

          {error === null ? null : (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className={TOUCH_BUTTON}
            onClick={() => {
              setOpen(false);
            }}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            variant="accent"
            className={TOUCH_BUTTON}
            disabled={pending}
            onClick={submit}
          >
            {pending ? 'Wird angelegt…' : 'Test anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What will be created, in the coach's own words, before they commit to it. */
function Summary({
  name,
  typeLabel,
  templateName,
  exerciseCount,
  passes,
}: {
  readonly name: string;
  readonly typeLabel: string;
  readonly templateName: string | null;
  readonly exerciseCount: number;
  readonly passes: number;
}) {
  return (
    <dl className="flex flex-col gap-1 rounded-md border border-border bg-muted px-3 py-2.5 text-sm">
      <div className="flex flex-wrap gap-x-2">
        <dt className="text-muted-foreground">Wird angelegt:</dt>
        <dd className="min-w-0 font-medium break-words">{name}</dd>
      </div>
      <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
        <dt>Typ</dt>
        <dd className="font-medium">{typeLabel}</dd>
        <dt>· Vorlage</dt>
        <dd className="font-medium">{templateName ?? 'keine'}</dd>
        {templateName === null ? (
          <>
            <dt>· Übungen</dt>
            <dd className="font-medium" data-numeric>
              {exerciseCount}
            </dd>
            <dt>· Durchgänge</dt>
            <dd className="font-medium" data-numeric>
              {passes}
            </dd>
          </>
        ) : null}
      </div>
    </dl>
  );
}
