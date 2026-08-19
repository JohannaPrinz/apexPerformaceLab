'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { MEASUREMENT_TEMPLATES, MODULE_KEYS } from '@apex/domain';
import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { addModuleAction } from '../server/actions';

import { MODULE_LABELS_DE } from './labels';

/**
 * Adds a module — one test — to an assessment.
 *
 * A template is a **starting point**, never a binding: its configuration is
 * copied in and then belongs to this module, so editing the template later
 * cannot change a test that has already been performed. The coach adjusts the
 * measurements, the number of passes and the dimensions before performing it.
 *
 * The module list is the canonical eleven (§11); templates are offered for the
 * chosen module only, because that is the pairing that makes sense.
 */
export function AddModuleForm({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [moduleKey, setModuleKey] = useState<string>(MODULE_KEYS[0]);
  const [templateKey, setTemplateKey] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const templates = MEASUREMENT_TEMPLATES.filter((template) => template.moduleKey === moduleKey);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="moduleKey" className="text-sm font-medium text-foreground">
          Test
        </label>
        <select
          id="moduleKey"
          value={moduleKey}
          onChange={(event) => {
            setModuleKey(event.target.value);
            setTemplateKey('');
          }}
          className={`${TOUCH_FIELD} rounded-md border border-input bg-background px-3 shadow-sm ${FOCUS_RING}`}
        >
          {MODULE_KEYS.map((key) => (
            <option key={key} value={key}>
              {MODULE_LABELS_DE[key]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="templateKey" className="text-sm font-medium text-foreground">
          Vorlage
        </label>
        <select
          id="templateKey"
          value={templateKey}
          onChange={(event) => setTemplateKey(event.target.value)}
          disabled={templates.length === 0}
          className={`${TOUCH_FIELD} rounded-md border border-input bg-background px-3 shadow-sm disabled:opacity-50 ${FOCUS_RING}`}
        >
          <option value="">
            {templates.length === 0 ? 'Keine verfügbar' : 'Manuell konfigurieren'}
          </option>
          {templates.map((template) => (
            <option key={template.key} value={template.key}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      <Button
        variant="outline"
        className={TOUCH_BUTTON}
        disabled={pending || !templateKey}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await addModuleAction(assessmentId, moduleKey, templateKey);
            if (result.message) setError(result.message);
            else router.refresh();
          });
        }}
      >
        {pending ? 'Wird hinzugefügt…' : 'Test hinzufügen'}
      </Button>

      {!templateKey ? (
        <p className="text-xs text-muted-foreground">
          Die manuelle Konfiguration erfolgt im nächsten Schritt.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
