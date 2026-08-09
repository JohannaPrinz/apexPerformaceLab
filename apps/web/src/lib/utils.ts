/**
 * Framework-agnostic helpers.
 *
 * The bar for adding something here: it must be pure, have no dependency on
 * React, Next, or the database, and be needed by more than one feature slice.
 * Anything narrower belongs to its slice.
 */

/** Re-exported so app code has one import for class merging. */
export { cn } from '@apex/ui';

/**
 * Formats a number for display, defaulting to the user's locale.
 *
 * Centralised because inconsistent number formatting across a metrics-heavy
 * product reads as a bug to users.
 */
export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
  locale?: string,
): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    ...options,
  }).format(value);
}

/** Absolute URL builder — needed for emails, OG tags and OAuth redirects. */
export function absoluteUrl(path: string): string {
  const base =
    process.env['NEXT_PUBLIC_APP_URL'] ??
    (process.env['VERCEL_URL'] ? `https://${process.env['VERCEL_URL']}` : 'http://localhost:3000');

  return new URL(path, base).toString();
}

/** Narrows `unknown` caught values to a message without losing non-Error throws. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred.';
}

/** Type guard that removes `null` and `undefined`, e.g. in `.filter(isPresent)`. */
export function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}
