'use client';

import { useState } from 'react';

import { FOCUS_RING } from '@/components/common/touch';

/**
 * One text the coach writes.
 *
 * Saved on leaving the field: a paragraph is written, not typed at, and a write
 * behind every letter would be a write behind every letter. The value is held
 * locally so a re-render caused by saving another field cannot pull half-typed
 * text out from under the cursor.
 */
export function TextField({
  id,
  label,
  hint,
  value,
  disabled,
  rows = 3,
  onSave,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly rows?: number;
  readonly onSave: (text: string) => void;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);

  // Adjusted during render rather than in an effect: an effect would paint the
  // old text first and replace it a frame later.
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <textarea
        id={id}
        value={text}
        disabled={disabled}
        rows={rows}
        placeholder={hint}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onBlur={() => {
          if (text !== value) onSave(text);
        }}
        className={`${FOCUS_RING} w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base disabled:opacity-50 lg:text-sm`}
      />
    </div>
  );
}
