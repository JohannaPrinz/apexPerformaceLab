/**
 * Explicit result type for operations whose failure is an expected outcome
 * rather than a bug — validation, quota checks, integration timeouts.
 *
 * Thrown exceptions stay reserved for genuinely unexpected states. This keeps
 * the failure surface of a service function visible in its signature, which
 * matters most at the Server Action boundary where an uncaught throw becomes an
 * opaque 500 for the user.
 */
export type Result<TValue, TError = Error> =
  { readonly ok: true; readonly value: TValue } | { readonly ok: false; readonly error: TError };

export function ok<TValue>(value: TValue): Result<TValue, never> {
  return { ok: true, value };
}

export function err<TError>(error: TError): Result<never, TError> {
  return { ok: false, error };
}

export function isOk<TValue, TError>(
  result: Result<TValue, TError>,
): result is { readonly ok: true; readonly value: TValue } {
  return result.ok;
}

export function isErr<TValue, TError>(
  result: Result<TValue, TError>,
): result is { readonly ok: false; readonly error: TError } {
  return !result.ok;
}

/**
 * Unwraps a result, throwing the contained error when it is a failure.
 *
 * `TError` is not constrained to `Error` — a result may legitimately carry a
 * string code or a validation object. Non-`Error` failures are wrapped before
 * being thrown: throwing a bare value loses the stack trace, which is exactly
 * the context needed at the point where an expected failure is being escalated
 * into an exception.
 */
export function unwrap<TValue, TError>(result: Result<TValue, TError>): TValue {
  if (result.ok) return result.value;

  if (result.error instanceof Error) throw result.error;

  throw new Error(`Unwrapped a failed result: ${JSON.stringify(result.error)}`, {
    cause: result.error,
  });
}
