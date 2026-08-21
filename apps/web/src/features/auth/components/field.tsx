import { Input } from '@apex/ui';

import { TOUCH_FIELD } from '@/components/common/touch';

/**
 * A labelled input with its validation message.
 *
 * Local to the auth slice rather than in `@apex/ui`: the design system owns the
 * `Input` primitive, but the label/error/description arrangement around it is a
 * form-layout decision. It moves to the package once a second slice needs the
 * same arrangement — not before.
 *
 * The error is wired through `aria-describedby` and `aria-invalid`, so a screen
 * reader announces it and the invalid styling cannot drift from the accessible
 * state.
 */
export function Field({
  id,
  label,
  error,
  hint,
  ...props
}: React.ComponentProps<'input'> & {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>

      {/* The same touch size as every field inside the product. The sign-in
          page is where a phone user starts, and its inputs were 36px. */}
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        {...props}
        className={`${TOUCH_FIELD} ${props.className ?? ''}`}
      />

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
