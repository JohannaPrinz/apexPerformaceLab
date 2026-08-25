'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Badge, Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON } from '@/components/common/touch';

import { regenerateDraftAction, updateDraftTextAction } from '../server/actions';

/**
 * The text of an analysis, as the coach works on it.
 *
 * ## One rule above all others
 *
 * **Nothing overwrites what the coach wrote except the coach asking for it.**
 * Values arriving late, a test being added or set aside, a reload — none of
 * them touch a typed sentence. What changes is what this screen *says*: a line
 * appears offering to regenerate that one paragraph, and it does nothing until
 * it is pressed.
 *
 * ## Why "Automatisch erzeugt" disappears
 *
 * The marking is a statement about who wrote the words. The moment a person
 * edits them it stops being true, so it goes — a sentence a coach wrote must
 * never carry a label saying a machine produced it.
 *
 * ## Saved on leaving the field, not on every keystroke
 *
 * A paragraph is written, not typed at. Saving per character would put a write
 * behind every letter; saving on blur stores a thought.
 */

export interface DraftSectionView {
  readonly moduleId: string;
  readonly name: string;
  readonly typeLabel: string;
  readonly text: string;
  readonly generated: boolean;
  readonly basisChanged: boolean;
}

export interface DraftView {
  readonly reportId: string;
  readonly title: string;
  readonly version: number;
  readonly overall: { readonly text: string; readonly generated: boolean };
  readonly sections: readonly DraftSectionView[];
  readonly addedModuleNames: readonly string[];
  readonly removedModuleIds: readonly string[];
}

export function DraftEditor({ draft, readOnly }: { draft: DraftView; readOnly: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (work: () => Promise<{ message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.message) setError(result.message);
      else router.refresh();
    });
  };

  return (
    <section aria-label="Zusammenfassung" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Zusammenfassung</h3>
        {/* Said outright, because the absence of a verdict is easy to mistake
            for an oversight: the catalogue holds no reference ranges and the
            model records no direction for any quantity, so any assessment of
            these numbers would be invented. */}
        <p className="text-xs text-muted-foreground">
          Die erzeugten Texte beschreiben, was erfasst wurde. Es findet keine fachliche Bewertung
          statt — Referenzwerte und Richtungsangaben je Messgröße sind im Modell nicht hinterlegt.
          Jeder Text lässt sich frei bearbeiten.
        </p>
      </div>

      {draft.addedModuleNames.length === 0 ? null : (
        <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
          {draft.addedModuleNames.length === 1
            ? `„${draft.addedModuleNames[0]}" wurde in die Auswertung aufgenommen und hat noch keinen Text.`
            : `${String(draft.addedModuleNames.length)} Tests wurden in die Auswertung aufgenommen und haben noch keinen Text.`}
        </p>
      )}

      <DraftField
        fieldId="draft-overall"
        label="Gesamtauswertung"
        value={draft.overall.text}
        generated={draft.overall.generated}
        basisChanged={false}
        readOnly={readOnly}
        pending={pending}
        onSave={(text) =>
          run(() => updateDraftTextAction(draft.reportId, { kind: 'overall' }, text))
        }
        onRegenerate={() => {
          run(() => regenerateDraftAction(draft.reportId, { kind: 'overall' }));
        }}
      />

      {draft.sections.map((section) => (
        <DraftField
          key={section.moduleId}
          fieldId={`draft-${section.moduleId}`}
          label={section.name}
          hint={section.typeLabel}
          value={section.text}
          generated={section.generated}
          basisChanged={section.basisChanged}
          readOnly={readOnly}
          pending={pending}
          onSave={(text) =>
            run(() =>
              updateDraftTextAction(
                draft.reportId,
                { kind: 'section', moduleId: section.moduleId },
                text,
              ),
            )
          }
          onRegenerate={() => {
            run(() =>
              regenerateDraftAction(draft.reportId, {
                kind: 'section',
                moduleId: section.moduleId,
              }),
            );
          }}
        />
      ))}

      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function DraftField({
  fieldId,
  label,
  hint,
  value,
  generated,
  basisChanged,
  readOnly,
  pending,
  onSave,
  onRegenerate,
}: {
  /**
   * Unique per field, and derived from the test rather than from its name: two
   * tests of one type may share a name — that is the case §11 exists for — and
   * two labels pointing at one id would send a click to the wrong box.
   */
  fieldId: string;
  label: string;
  hint?: string;
  value: string;
  generated: boolean;
  basisChanged: boolean;
  readOnly: boolean;
  pending: boolean;
  onSave: (text: string) => void;
  onRegenerate: () => void;
}) {
  /**
   * What is in the box while it is being typed in.
   *
   * Kept locally so a re-render triggered by saving another field cannot pull
   * half-typed text out from under the cursor. Re-seeded whenever the stored
   * value changes — after a save, and after a regeneration.
   *
   * Adjusted during render rather than in an effect: an effect would paint the
   * old text first and replace it a frame later, and React warns about the
   * cascading render for exactly that reason.
   */
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);

  if (seen !== value) {
    setSeen(value);
    setText(value);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <label htmlFor={fieldId} className="text-sm font-medium break-words">
          {label}
        </label>
        {hint === undefined ? null : <span className="text-xs text-muted-foreground">{hint}</span>}
        {generated ? (
          <Badge variant="secondary">Automatisch erzeugt</Badge>
        ) : (
          <Badge variant="outline">Bearbeitet</Badge>
        )}
      </div>

      <textarea
        id={fieldId}
        value={text}
        readOnly={readOnly}
        disabled={pending}
        rows={4}
        onChange={(event) => {
          setText(event.target.value);
        }}
        // Saved on leaving the field: a paragraph is written, not typed at, and
        // a write behind every letter would be a write behind every letter.
        onBlur={() => {
          if (!readOnly && text !== value) onSave(text);
        }}
        className={`${FOCUS_RING} min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm read-only:text-muted-foreground disabled:opacity-50`}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {basisChanged ? (
          /* A statement, not an action taken on the coach's behalf: their text
             stands until they say otherwise. */
          <p className="text-xs text-muted-foreground">
            Die zugrunde liegenden Werte haben sich seit der Erzeugung geändert.
          </p>
        ) : (
          <span />
        )}

        {readOnly ? null : (
          <Button
            type="button"
            variant="ghost"
            className={TOUCH_BUTTON}
            disabled={pending}
            onClick={onRegenerate}
          >
            Neu erzeugen
          </Button>
        )}
      </div>
    </div>
  );
}
