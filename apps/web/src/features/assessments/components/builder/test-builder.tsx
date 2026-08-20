'use client';

import { useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  MEASUREMENT_TEMPLATES,
  MODULE_KEYS,
  type ModuleConfiguration,
  type ModuleKey,
} from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';

import { addConfiguredModuleAction, updateModuleConfigurationAction } from '../../server/actions';
import { MEASUREMENT_ROLE_LABELS_DE, MODULE_LABELS_DE } from '../labels';

import {
  BUILDER_STEP_LABELS,
  BUILDER_STEPS,
  draftFromConfiguration,
  draftFromTemplateKey,
  emptyDraft,
  expectedCount,
  ROLE_EXPLANATIONS,
  stepIssues,
  summarise,
  toConfiguration,
  type BuilderDraft,
  type BuilderStep,
} from './draft';
import { MeasurementPicker, type MeasurementTypeOption } from './measurement-picker';
import { ProtocolStep, type ExerciseOption } from './protocol-step';

/**
 * Configuring one test.
 *
 * Four steps — which test, what it records, how it is carried out, and a
 * summary the coach reads before saving.
 *
 * **The builder holds a draft, not a configuration.** It becomes one only at
 * the end, through `moduleConfigurationSchema` — the same contract that
 * validates `AssessmentModule.payload`, re-checked in the procedure. There is
 * no second configuration structure anywhere in this screen (§16).
 *
 * A template seeds the draft and is then forgotten: nothing links the module
 * back to it, which is what makes "editing a template never changes an existing
 * assessment" structural rather than a rule to remember.
 *
 * Nothing here decides authorization. Every id the draft carries is verified
 * server-side against this workspace's catalogues before anything is written.
 */
export function TestBuilder({
  assessmentId,
  measurementTypes,
  exercises,
  existing,
  takenModuleKeys,
}: {
  assessmentId: string;
  measurementTypes: readonly MeasurementTypeOption[];
  exercises: readonly ExerciseOption[];
  /** Set when reconfiguring a test that already exists. */
  existing?: { moduleId: string; moduleKey: ModuleKey; configuration: ModuleConfiguration };
  /** Modules the assessment already holds — each may appear only once. */
  takenModuleKeys?: readonly string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<BuilderStep>(existing ? 'measurements' : 'test');

  const [draft, setDraft] = useState<BuilderDraft>(() =>
    existing
      ? draftFromConfiguration(existing.moduleKey, existing.configuration)
      : emptyDraft(firstFreeModuleKey(takenModuleKeys ?? [])),
  );

  const idForTypeKey = useMemo(() => {
    const byKey = new Map(measurementTypes.map((option) => [option.key, option.id]));

    return (key: string) => byKey.get(key);
  }, [measurementTypes]);

  const names = useMemo(() => {
    const types = new Map(measurementTypes.map((option) => [option.id, option.name]));
    const movements = new Map(exercises.map((option) => [option.id, option.name]));

    return {
      measurementType: (id: string) => types.get(id) ?? 'Unbekannte Messgröße',
      exercise: (id: string) => movements.get(id) ?? 'Unbekannte Übung',
    };
  }, [measurementTypes, exercises]);

  const issues = stepIssues(draft, step);
  const stepIndex = BUILDER_STEPS.indexOf(step);
  const configuration = toConfiguration(draft);

  function save() {
    if (!configuration) {
      setError('Dieser Test ist noch nicht vollständig.');

      return;
    }

    setError(null);
    startTransition(async () => {
      const result = existing
        ? await updateModuleConfigurationAction(existing.moduleId, assessmentId, configuration)
        : await addConfiguredModuleAction(assessmentId, draft.name, draft.moduleKey, configuration);

      if (result.message) setError(result.message);
      else {
        router.push(`/assessments/${assessmentId}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Schritte" className="flex flex-wrap items-center gap-2">
        {BUILDER_STEPS.map((entry, index) => {
          const reachable =
            index <= stepIndex ||
            BUILDER_STEPS.slice(0, index).every(
              (earlier) => stepIssues(draft, earlier).length === 0,
            );

          return (
            <button
              key={entry}
              type="button"
              disabled={!reachable}
              aria-current={entry === step ? 'step' : undefined}
              onClick={() => setStep(entry)}
              className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-md border px-3 text-sm transition-colors disabled:opacity-40 ${
                entry === step
                  ? 'border-accent bg-accent-soft text-accent-soft-foreground'
                  : 'border-border hover:border-border-strong'
              }`}
            >
              <span data-numeric className="text-muted-foreground">
                {index + 1}
              </span>{' '}
              {BUILDER_STEP_LABELS[entry]}
            </button>
          );
        })}
      </nav>

      {step === 'test' ? (
        <TestStep
          draft={draft}
          takenModuleKeys={takenModuleKeys ?? []}
          onChange={setDraft}
          onPickTemplate={(templateKey) =>
            setDraft(
              templateKey === ''
                ? emptyDraft(draft.moduleKey)
                : draftFromTemplateKey(templateKey, draft.moduleKey, idForTypeKey),
            )
          }
        />
      ) : null}

      {step === 'measurements' ? (
        <MeasurementPicker draft={draft} options={measurementTypes} onChange={setDraft} />
      ) : null}

      {step === 'protocol' ? (
        <ProtocolStep draft={draft} exercises={exercises} onChange={setDraft} />
      ) : null}

      {step === 'summary' ? <Summary draft={draft} names={names} /> : null}

      {issues.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {issues.map((issue) => (
            <li key={issue} className="text-sm text-muted-foreground">
              {issue}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button
          variant="ghost"
          className={TOUCH_BUTTON}
          disabled={stepIndex === 0 || pending}
          onClick={() => setStep(BUILDER_STEPS[stepIndex - 1] ?? 'test')}
        >
          Zurück
        </Button>

        {step === 'summary' ? (
          <Button
            className={TOUCH_BUTTON}
            variant="accent"
            disabled={pending || !configuration}
            onClick={save}
          >
            {pending ? 'Wird gespeichert…' : existing ? 'Änderungen speichern' : 'Test hinzufügen'}
          </Button>
        ) : (
          <Button
            className={TOUCH_BUTTON}
            variant="accent"
            disabled={issues.length > 0 || pending}
            onClick={() => setStep(BUILDER_STEPS[stepIndex + 1] ?? 'summary')}
          >
            Weiter
          </Button>
        )}
      </div>
    </div>
  );
}

/** The first module the assessment does not hold yet — each appears once. */
function firstFreeModuleKey(taken: readonly string[]): ModuleKey {
  return MODULE_KEYS.find((key) => !taken.includes(key)) ?? 'custom';
}

function TestStep({
  draft,
  takenModuleKeys,
  onChange,
  onPickTemplate,
}: {
  draft: BuilderDraft;
  takenModuleKeys: readonly string[];
  onChange: (draft: BuilderDraft) => void;
  onPickTemplate: (templateKey: string) => void;
}) {
  const templates = MEASUREMENT_TEMPLATES.filter(
    (template) => template.moduleKey === draft.moduleKey,
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="testName" className="text-sm font-medium">
            Name des Tests
          </label>
          <input
            id="testName"
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            placeholder="z. B. Laufen – Laktat"
            className={`${TOUCH_FIELD} ${FOCUS_RING} w-full max-w-md rounded-md border border-input bg-background px-3 shadow-sm`}
          />
          <p className="text-xs text-muted-foreground">
            Der Name unterscheidet mehrere Tests desselben Typs in einem Assessment.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Testtyp</h3>
          <p className="text-xs text-muted-foreground">
            Der Typ bestimmt, womit dieses Assessment später verglichen wird. Mehrere Tests
            desselben Typs sind ausdrücklich möglich.
          </p>
        </div>

        <ul className="flex flex-wrap gap-2">
          {MODULE_KEYS.map((key) => {
            const taken = takenModuleKeys.includes(key);
            const chosen = draft.moduleKey === key;

            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={taken}
                  aria-pressed={chosen}
                  onClick={() => onChange({ ...emptyDraft(key) })}
                  className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-md border px-3 text-sm transition-colors disabled:opacity-40 ${
                    chosen
                      ? 'border-accent bg-accent-soft text-accent-soft-foreground'
                      : 'border-border hover:border-border-strong'
                  }`}
                >
                  {MODULE_LABELS_DE[key]}
                  {taken ? (
                    <span className="text-muted-foreground"> · bereits enthalten</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Von einer Vorlage starten</h3>
          <p className="text-xs text-muted-foreground">
            A template is a starting point. Its configuration is copied in and then belongs to this
            test — changing the template later never touches it.
          </p>
        </div>

        {templates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Keine Vorlage für {MODULE_LABELS_DE[draft.moduleKey]}. Im nächsten Schritt
            konfigurieren.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            <li>
              <button
                type="button"
                aria-pressed={draft.templateKey === null}
                onClick={() => onPickTemplate('')}
                className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-md border px-3 text-sm transition-colors ${
                  draft.templateKey === null
                    ? 'border-accent bg-accent-soft text-accent-soft-foreground'
                    : 'border-border hover:border-border-strong'
                }`}
              >
                Von Grund auf konfigurieren
              </button>
            </li>
            {templates.map((template) => (
              <li key={template.key}>
                <button
                  type="button"
                  aria-pressed={draft.templateKey === template.key}
                  onClick={() => onPickTemplate(template.key)}
                  className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-md border px-3 text-sm transition-colors ${
                    draft.templateKey === template.key
                      ? 'border-accent bg-accent-soft text-accent-soft-foreground'
                      : 'border-border hover:border-border-strong'
                  }`}
                >
                  {template.name}
                  <span className="text-muted-foreground">
                    {' · '}
                    {template.measurements.length} measurements
                    {template.passes > 1 ? `, ${String(template.passes)} Stufen` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** What the coach reads before saving — names, never ids. */
function Summary({
  draft,
  names,
}: {
  draft: BuilderDraft;
  names: { measurementType: (id: string) => string; exercise: (id: string) => string };
}) {
  const lines = summarise(draft, names);
  const expected = expectedCount(draft);

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        {lines.map((line) => (
          <div key={line.label} className="flex flex-col gap-1">
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">{line.label}</dt>
            {line.entries ? (
              <dd>
                <ul className="flex flex-col gap-1">
                  {line.entries.map((entry) => (
                    <li key={entry.name} className="flex flex-wrap items-center gap-2 text-sm">
                      <span aria-hidden className="text-accent">
                        ✓
                      </span>
                      <span>{entry.name}</span>
                      <Badge variant={entry.role === 'required' ? 'accent' : 'secondary'}>
                        {MEASUREMENT_ROLE_LABELS_DE[entry.role]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {ROLE_EXPLANATIONS[entry.role]}
                      </span>
                    </li>
                  ))}
                </ul>
              </dd>
            ) : (
              <dd className="text-sm">{line.value}</dd>
            )}
          </div>
        ))}
      </dl>

      {expected > 0 ? (
        <p className="text-sm text-muted-foreground">
          Fully recorded, this test holds <span data-numeric>{expected}</span> measurements. A value
          left empty stays empty — nothing is filled in.
        </p>
      ) : null}
    </div>
  );
}
