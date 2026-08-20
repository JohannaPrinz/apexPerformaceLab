'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { MEASUREMENT_TEMPLATES, MODULE_KEYS } from '@apex/domain';
import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { addModuleAction } from '../server/actions';

import { MODULE_LABELS_DE } from './labels';

/**
 * The quick way to add a test.
 *
 * Three fields in one row: what it is called, what kind of test it is, and which
 * template it starts from. That is everything needed for a test built on a
 * template, which is the ordinary case — anything beyond it goes through the
 * builder, and the link to it is right here rather than hidden.
 *
 * ## Why the name comes first
 *
 * A test used to *be* its type: one lactate test per assessment, and the type
 * was its identity. A diagnostic session records a lactate run, a sprint and an
 * endurance run — three tests of type "Laufen" — so the name is what tells them
 * apart and it is the first thing asked for.
 *
 * The type is proposed as the name until the coach types their own, because a
 * name is required and "Laufen" is a truthful default rather than an empty
 * field standing between them and the test.
 */
export function AddModuleForm({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [moduleKey, setModuleKey] = useState<string>(MODULE_KEYS[0]);
  const [name, setName] = useState<string>('');
  const [templateKey, setTemplateKey] = useState<string>('');

  const templates = MEASUREMENT_TEMPLATES.filter((template) => template.moduleKey === moduleKey);
  const proposed = MODULE_LABELS_DE[moduleKey as keyof typeof MODULE_LABELS_DE] ?? moduleKey;
  const effectiveName = name.trim() === '' ? proposed : name.trim();

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="moduleName" label="Name des Tests">
          <input
            id="moduleName"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder={proposed}
            className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm`}
          />
        </Field>

        <Field id="moduleKey" label="Testtyp">
          <select
            id="moduleKey"
            value={moduleKey}
            onChange={(event) => {
              setModuleKey(event.target.value);
              // A template belongs to one type, so a type change invalidates it.
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
        </Field>

        <Field id="templateKey" label="Vorlage">
          <select
            id="templateKey"
            value={templateKey}
            onChange={(event) => {
              setTemplateKey(event.target.value);
            }}
            disabled={templates.length === 0}
            className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm disabled:opacity-50`}
          >
            <option value="">
              {templates.length === 0 ? 'Keine Vorlage vorhanden' : 'Ohne Vorlage'}
            </option>
            {templates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="accent"
          className={TOUCH_BUTTON}
          disabled={pending || templateKey === ''}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await addModuleAction(
                assessmentId,
                effectiveName,
                moduleKey,
                templateKey,
              );
              if (result.message) setError(result.message);
              else {
                setName('');
                setTemplateKey('');
                router.refresh();
              }
            });
          }}
        >
          {pending ? 'Wird hinzugefügt…' : 'Test hinzufügen'}
        </Button>

        <span className="text-sm text-muted-foreground">
          {templateKey === ''
            ? 'Ohne Vorlage konfigurieren Sie den Test im nächsten Schritt.'
            : `Wird als „${effectiveName}“ angelegt.`}
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
