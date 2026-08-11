'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { MEASUREMENT_TEMPLATES, MODULE_KEYS, MODULE_LABELS } from '@apex/domain';
import { Button } from '@apex/ui';

import { addModuleAction } from '../server/actions';

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
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {MODULE_KEYS.map((key) => (
            <option key={key} value={key}>
              {MODULE_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="templateKey" className="text-sm font-medium text-foreground">
          Template
        </label>
        <select
          id="templateKey"
          value={templateKey}
          onChange={(event) => setTemplateKey(event.target.value)}
          disabled={templates.length === 0}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        >
          <option value="">
            {templates.length === 0 ? 'None available' : 'Configure manually'}
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
        size="sm"
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
        {pending ? 'Adding…' : 'Add test'}
      </Button>

      {!templateKey ? (
        <p className="text-xs text-muted-foreground">
          Manual configuration arrives with the measurement entry screen.
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
