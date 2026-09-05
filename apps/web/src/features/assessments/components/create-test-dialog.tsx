'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { Pencil, Plus, Trash2, X } from 'lucide-react';

import {
  MEASUREMENT_TEMPLATES,
  MODULE_KEYS,
  type MeasurementRole,
  type ModuleKey,
} from '@apex/domain';
import { Button, Dialog, DialogContent, DialogFooter, DialogTrigger } from '@apex/ui';

import { ActionMenu, ActionMenuItem } from '@/components/common/action-menu';
import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';

import {
  addConfiguredModuleAction,
  deleteModuleTemplateAction,
  renameModuleTemplateAction,
  saveModuleTemplateAction,
} from '../server/actions';

import {
  draftFromConfiguration,
  draftFromTemplateKey,
  emptyDraft,
  toConfiguration,
  withMeasurementType,
  withoutMeasurementType,
  withPasses,
  withRecordsSide,
  withRole,
  type BuilderDraft,
} from './builder/draft';
import { ExercisePicker } from './exercise-picker';
import {
  MEASUREMENT_CATEGORY_LABELS_DE,
  MEASUREMENT_ROLE_LABELS_DE,
  MODULE_LABELS_DE,
} from './labels';

/**
 * Adding a test without leaving the assessment.
 *
 * ## Why a template shows itself
 *
 * A template is a starting point, and a starting point nobody can see is a
 * promise. Choosing one used to replace the whole form with a sentence saying
 * the measurements would come along — so a coach learned what they had agreed
 * to only after the test existed, and the exercise picker disappeared with it,
 * which is why a strength test could not be given its lift here at all.
 *
 * Now the template fills a draft and the draft is on screen: its quantities,
 * what each is worth, how many passes, whether sides are recorded. All of it
 * editable, because "a starting point" means exactly that.
 *
 * ## Why quantities can be added here too
 *
 * This used to offer removal only, on the reasoning that adding one composes a
 * test rather than adjusts it. That reasoning does not survive contact with a
 * test type that has no template: `nutrition`, `recovery`, `sleep` and several
 * others ship none, so "choose a template and adjust it" was advice a coach
 * could not follow, and the only way to record anything at all for those was
 * the full builder — which is also the only way to arrive at a configuration
 * worth saving as an own template.
 *
 * So the list adds as well as removes, exactly as the exercise picker beside it
 * already did. Naming context dimensions and writing a protocol still belong to
 * the builder: those need room, and they have their own route.
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

/**
 * One configuration this workspace saved.
 *
 * Offered beside the shipped templates and never mixed in with them: one is a
 * global professional starting point, the other is what this practice runs, and
 * a coach should be able to tell which is which without reading the name twice.
 */
export interface OwnTemplateOption {
  readonly id: string;
  readonly name: string;
  readonly moduleKey: string;
  readonly configuration: unknown;
}

/** One quantity of the workspace's catalogue, as the picker needs it. */
export interface SelectableMeasurementType {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly unit: string;
  /** The professional area, used to group the list — never to restrict it (§12). */
  readonly category: string;
}

const ROLES: readonly MeasurementRole[] = ['required', 'recommended', 'optional'];

export function CreateTestDialog({
  assessmentId,
  exercises,
  measurementTypes,
  ownTemplates,
}: {
  readonly assessmentId: string;
  /**
   * The exercises this workspace may use, already resolved by the page through
   * the ordinary exercise procedure — catalogue plus this workspace's own, and
   * never another tenant's. This dialog does not query and does not filter by
   * ownership; it only lets the coach pick from what they were given.
   */
  readonly exercises: readonly SelectableExercise[];
  /** The same, for quantities: a template names them by key, the draft by id. */
  readonly measurementTypes: readonly SelectableMeasurementType[];
  /** What this workspace saved for itself. Empty until a coach saves one. */
  readonly ownTemplates: readonly OwnTemplateOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [moduleKey, setModuleKey] = useState<ModuleKey>(MODULE_KEYS[0]);
  const [templateKey, setTemplateKey] = useState('');
  const [advanced, setAdvanced] = useState(false);
  /**
   * The test as it stands, whether a template seeded it or not.
   *
   * One shape for both paths: a template is applied by *filling this in*, which
   * is what the domain says applying one does — it copies a configuration and
   * keeps no reference to where it came from.
   */
  const [draft, setDraft] = useState<BuilderDraft>(() => emptyDraft(MODULE_KEYS[0]));
  /** What the picker last applied, so "adjusted" is a comparison and not a guess. */
  const [applied, setApplied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const idForTypeKey = (key: string) =>
    measurementTypes.find((type) => type.key === key)?.id ?? undefined;
  const typeById = (id: string) => measurementTypes.find((type) => type.id === id) ?? null;

  const templates = MEASUREMENT_TEMPLATES.filter((template) => template.moduleKey === moduleKey);
  const own = ownTemplates.filter((template) => template.moduleKey === moduleKey);
  const chosenOwn = own.find((template) => `own:${template.id}` === templateKey) ?? null;

  /**
   * Whether the draft still says what the chosen template said.
   *
   * Compared against the configuration as applied rather than tracked with a
   * flag: a coach who changes a role and changes it back has not adjusted
   * anything, and offering to save that would be noise.
   */
  const configuration = toConfiguration(draft);
  const adjusted =
    applied !== null && configuration !== null && JSON.stringify(configuration) !== applied;
  const typeLabel = MODULE_LABELS_DE[moduleKey] ?? moduleKey;
  const effectiveName = name.trim() === '' ? typeLabel : name.trim();

  function reset() {
    setName('');
    setTemplateKey('');
    setAdvanced(false);
    setDraft(emptyDraft(MODULE_KEYS[0]));
    setModuleKey(MODULE_KEYS[0]);
    setApplied(null);
    setSaving(false);
    setTemplateName('');
    setError(null);
  }

  function chooseTemplate(next: string) {
    setTemplateKey(next);

    if (next === '') {
      setDraft(emptyDraft(moduleKey));
      setApplied(null);

      return;
    }

    // Applying **copies** the configuration and keeps no reference to where it
    // came from (§30). That holds for both kinds: what is created afterwards is
    // the draft, and renaming or deleting a template can never reach it.
    const ownTemplate = own.find((template) => `own:${template.id}` === next);
    const seeded =
      ownTemplate === undefined
        ? draftFromTemplateKey(next, moduleKey, idForTypeKey, (key) => {
            // Templates name exercises by catalogue key; the picker holds ids.
            return exercises.find((exercise) => exercise.name === key)?.id;
          })
        : draftFromConfiguration(moduleKey, ownTemplate.configuration as never, ownTemplate.name);

    setDraft(seeded);
    setApplied(JSON.stringify(toConfiguration(seeded)));

    // A template proposes the name only while the coach has not typed one.
    const proposed =
      ownTemplate?.name ?? MEASUREMENT_TEMPLATES.find((entry) => entry.key === next)?.name;
    if (proposed !== undefined && name.trim() === '') setName(proposed);
  }

  function renameTemplate(templateId: string, next: string) {
    setError(null);
    setPending(true);
    void renameModuleTemplateAction(assessmentId, templateId, next).then(
      (result) => {
        setPending(false);
        if (result.message !== undefined) setError(result.message);
        else router.refresh();
      },
      () => {
        setPending(false);
        setError('Die Vorlage konnte nicht umbenannt werden.');
      },
    );
  }

  function deleteTemplate(templateId: string) {
    setError(null);
    setPending(true);
    void deleteModuleTemplateAction(assessmentId, templateId).then(
      (result) => {
        setPending(false);
        if (result.message !== undefined) {
          setError(result.message);

          return;
        }
        // The draft stays: the coach was configuring a test, and deleting the
        // starting point is not a reason to take their work away.
        setTemplateKey('');
        setApplied(null);
        router.refresh();
      },
      () => {
        setPending(false);
        setError('Die Vorlage konnte nicht gelöscht werden.');
      },
    );
  }

  function saveTemplate() {
    setError(null);
    if (configuration === null) {
      setError('Diese Vorlage hat noch keine Messgröße.');

      return;
    }

    setPending(true);
    void saveModuleTemplateAction(assessmentId, templateName, moduleKey, configuration).then(
      (result) => {
        setPending(false);
        if (result.message !== undefined) {
          setError(result.message);

          return;
        }
        setSaving(false);
        setTemplateName('');
        // The saved shape is now what "unadjusted" means.
        setApplied(JSON.stringify(configuration));
        router.refresh();
      },
      () => {
        setPending(false);
        setError('Die Vorlage konnte nicht gespeichert werden.');
      },
    );
  }

  function submit() {
    setError(null);
    setPending(true);

    // Always the configured path: what gets created is the draft on screen,
    // template or not. Sending a template key instead would file something the
    // coach could see but had not agreed to.
    if (configuration === null) {
      setError('Dieser Test hat noch keine Messgröße.');
      setPending(false);

      return;
    }

    void addConfiguredModuleAction(assessmentId, effectiveName, moduleKey, configuration).then(
      (result) => {
        setPending(false);
        if (result.message !== undefined) {
          setError(result.message);

          return;
        }
        setOpen(false);
        reset();
        router.refresh();
      },
      () => {
        setPending(false);
        setError('Der Test konnte nicht angelegt werden.');
      },
    );
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
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="testName" className="text-sm font-medium">
              Name des Tests
            </label>
            <input
              id="testName"
              value={name}
              placeholder={typeLabel}
              onChange={(event) => {
                setName(event.target.value);
              }}
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
                  const next = event.target.value as ModuleKey;
                  setModuleKey(next);
                  // The templates of the old type do not apply to the new one.
                  setTemplateKey('');
                  setDraft(emptyDraft(next));
                }}
                className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm`}
              >
                {MODULE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {MODULE_LABELS_DE[key] ?? key}
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
                  chooseTemplate(event.target.value);
                }}
                // Both lists, not just the shipped one: a test type that
                // ships no template is exactly the type a coach saves their own
                // for, and locking the picker on the shipped count made that
                // saved template unreachable.
                disabled={templates.length === 0 && own.length === 0}
                className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm disabled:opacity-50`}
              >
                <option value="">
                  {templates.length === 0 && own.length === 0
                    ? 'Keine Vorlage verfügbar'
                    : 'Ohne Vorlage'}
                </option>

                {/* Two groups, never one list: a shipped template is a global
                    professional starting point, an own one is what this
                    practice runs. Which is which decides how much a coach
                    trusts it, so the picker says so. */}
                {templates.length === 0 ? null : (
                  <optgroup label="Apex OS">
                    {templates.map((template) => (
                      <option key={template.key} value={template.key}>
                        {template.name}
                      </option>
                    ))}
                  </optgroup>
                )}

                {own.length === 0 ? null : (
                  <optgroup label="Eigene Vorlagen">
                    {own.map((template) => (
                      <option key={template.id} value={`own:${template.id}`}>
                        {template.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* Only where something was actually changed. Saving a shipped
              template unchanged would put a second entry in the picker meaning
              exactly what the first one means. */}
          {adjusted || chosenOwn !== null ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
              {chosenOwn === null ? null : (
                <>
                  <span className="min-w-0 flex-1 text-sm break-words">
                    Eigene Vorlage: <span className="font-medium">{chosenOwn.name}</span>
                  </span>

                  <ActionMenu label={`Aktionen: ${chosenOwn.name}`}>
                    <ActionMenuItem
                      disabled={pending}
                      onClick={() => {
                        const next = window.prompt('Neuer Name der Vorlage', chosenOwn.name);
                        if (next !== null && next.trim() !== '') renameTemplate(chosenOwn.id, next);
                      }}
                    >
                      <Pencil aria-hidden="true" />
                      Umbenennen
                    </ActionMenuItem>

                    <ActionMenuItem
                      disabled={pending}
                      onClick={() => {
                        deleteTemplate(chosenOwn.id);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                      Löschen
                    </ActionMenuItem>
                  </ActionMenu>
                </>
              )}

              {!adjusted ? null : saving ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                  <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
                    <span className="text-xs font-medium">Name der Vorlage</span>
                    <input
                      value={templateName}
                      placeholder="z. B. Unser Stufentest"
                      autoFocus
                      onChange={(event) => {
                        setTemplateName(event.target.value);
                      }}
                      className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3`}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="accent"
                    className={TOUCH_BUTTON}
                    disabled={pending || templateName.trim() === ''}
                    onClick={saveTemplate}
                  >
                    Speichern
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className={TOUCH_BUTTON}
                    onClick={() => {
                      setSaving(false);
                    }}
                  >
                    Abbrechen
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className={`${TOUCH_BUTTON} ml-auto`}
                  onClick={() => {
                    // Deliberately not pre-filled. The test's name is usually
                    // the template's own — "Laktat-Stufentest" — and offering
                    // that made an entry indistinguishable from the shipped one
                    // the default outcome. A saved template is named on purpose.
                    setTemplateName('');
                    setSaving(true);
                  }}
                >
                  Als Vorlage speichern
                </Button>
              )}
            </div>
          ) : null}

          <MeasurementPreview
            draft={draft}
            measurementTypes={measurementTypes}
            typeById={typeById}
            onRole={(id, role) => {
              setDraft((previous) => withRole(previous, id, role));
            }}
            onAdd={(id) => {
              setDraft((previous) => withMeasurementType(previous, id));
            }}
            onRemove={(id) => {
              setDraft((previous) => withoutMeasurementType(previous, id));
            }}
          />

          {/* Always offered, template or not. A strength template deliberately
              proposes no movement — §12a leaves that to the assessment — and
              hiding the picker made it unreachable from here. */}
          <ExercisePicker
            exercises={exercises}
            chosen={draft.exerciseIds}
            onToggle={(id) => {
              setDraft((previous) => ({
                ...previous,
                exerciseIds: previous.exerciseIds.includes(id)
                  ? previous.exerciseIds.filter((entry) => entry !== id)
                  : [...previous.exerciseIds, id],
              }));
            }}
          />

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
                    value={draft.passes}
                    onChange={(event) => {
                      setDraft((previous) =>
                        withPasses(previous, Math.max(1, Number(event.target.value) || 1)),
                      );
                    }}
                    className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm`}
                    data-numeric
                  />
                  <p className="text-xs text-muted-foreground">
                    Wie oft der gesamte Satz erfasst wird — bei einem Stufentest die Anzahl der
                    Stufen.
                  </p>
                </div>

                {/* The hit area is the whole label, not the 16px box: a checkbox
                    measures below every touch guidance, and enlarging the box
                    itself would look wrong. */}
                <label
                  className={`${TOUCH_TARGET} flex cursor-pointer items-start gap-2 rounded-md py-2 text-sm sm:pt-7`}
                >
                  <input
                    type="checkbox"
                    checked={draft.recordsSide}
                    onChange={(event) => {
                      setDraft((previous) => withRecordsSide(previous, event.target.checked));
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

            {draft.dimensions.length === 0 ? null : (
              <p className="text-xs text-pretty text-muted-foreground">
                Merkmale: {draft.dimensions.map((dimension) => dimension.label).join(' · ')} — über
                „Ausführlich konfigurieren“ änderbar.
              </p>
            )}
          </div>

          <Summary
            name={effectiveName}
            typeLabel={typeLabel}
            templateName={
              MEASUREMENT_TEMPLATES.find((entry) => entry.key === templateKey)?.name ?? null
            }
            exerciseCount={draft.exerciseIds.length}
            passes={draft.passes}
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

/**
 * What the test will record, and what each reading is worth to it.
 *
 * The roles are the one thing a coach genuinely changes about a template: the
 * same protocol is run with a heart rate as a requirement in one workspace and
 * as a nicety in another. Adding and removing are offered beside them, so a
 * test type that ships no template can be assembled here and saved as one.
 *
 * ## Why a select and not the builder's chips
 *
 * The builder lists the whole catalogue as buttons with a search box, which is
 * right on a page with room for it. Inside a dialog that already holds a name,
 * a type, a template, the quantities and the exercises, thirty buttons would
 * bury everything above them — and a native select is the control a phone
 * renders as a full-screen list with its own search, which is the same thing
 * the builder builds by hand.
 */
function MeasurementPreview({
  draft,
  measurementTypes,
  typeById,
  onRole,
  onAdd,
  onRemove,
}: {
  readonly draft: BuilderDraft;
  readonly measurementTypes: readonly SelectableMeasurementType[];
  readonly typeById: (id: string) => SelectableMeasurementType | null;
  readonly onRole: (measurementTypeId: string, role: MeasurementRole) => void;
  readonly onAdd: (measurementTypeId: string) => void;
  readonly onRemove: (measurementTypeId: string) => void;
}) {
  const chosen = new Set(draft.measurementTypes.map((entry) => entry.measurementTypeId));

  /**
   * The catalogue by professional area, minus what is already in the test.
   *
   * Grouped because thirty quantities in one flat list is a scroll, and the
   * area is how a coach looks for one. It is a filter and never a restriction
   * (§12): every group is offered whatever the test type is, so a lactate test
   * can be given a body weight.
   */
  const groups = new Map<string, SelectableMeasurementType[]>();
  for (const type of measurementTypes) {
    if (chosen.has(type.id)) continue;
    const group = groups.get(type.category);
    if (group) group.push(type);
    else groups.set(type.category, [type]);
  }

  const adder = (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium">Messgröße hinzufügen</span>
      <select
        aria-label="Messgröße hinzufügen"
        value=""
        disabled={groups.size === 0}
        onChange={(event) => {
          if (event.target.value !== '') onAdd(event.target.value);
        }}
        className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm disabled:opacity-50`}
      >
        <option value="">
          {groups.size === 0 ? 'Alles aus dem Katalog gehört bereits dazu' : 'Auswählen…'}
        </option>
        {[...groups].map(([category, types]) => (
          <optgroup key={category} label={MEASUREMENT_CATEGORY_LABELS_DE[category] ?? category}>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
                {type.unit === '' ? '' : ` · ${type.unit}`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );

  if (draft.measurementTypes.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-pretty text-muted-foreground">
          Dieser Test erfasst noch nichts. Wählen Sie eine Vorlage, oder stellen Sie die Messgrößen
          hier selbst zusammen.
        </p>
        {adder}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        Erfasst wird{' '}
        <span className="text-muted-foreground" data-numeric>
          ({draft.measurementTypes.length})
        </span>
      </h3>

      <ul className="flex flex-col gap-1.5">
        {draft.measurementTypes.map((entry) => {
          const type = typeById(entry.measurementTypeId);

          return (
            <li
              key={entry.measurementTypeId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 break-words">
                {type?.name ?? 'Unbekannte Messgröße'}
                {type === null || type.unit === '' ? null : (
                  <span className="text-muted-foreground"> · {type.unit}</span>
                )}
              </span>

              <label className="flex items-center gap-1.5">
                <span className="sr-only">Bedeutung von {type?.name ?? 'dieser Messgröße'}</span>
                <select
                  value={entry.role}
                  onChange={(event) => {
                    onRole(entry.measurementTypeId, event.target.value as MeasurementRole);
                  }}
                  className={`${FOCUS_RING} rounded-md border border-input bg-background px-2 py-1 text-xs`}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {MEASUREMENT_ROLE_LABELS_DE[role]}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                aria-label={`${type?.name ?? 'Messgröße'} entfernen`}
                onClick={() => {
                  onRemove(entry.measurementTypeId);
                }}
                className={`${FOCUS_RING} ${TOUCH_TARGET} -mr-1 rounded px-1 text-muted-foreground hover:text-destructive`}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>

      {adder}
    </div>
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
        <dt>· Übungen</dt>
        <dd className="font-medium" data-numeric>
          {exerciseCount}
        </dd>
        <dt>· Durchgänge</dt>
        <dd className="font-medium" data-numeric>
          {passes}
        </dd>
      </div>
    </dl>
  );
}
