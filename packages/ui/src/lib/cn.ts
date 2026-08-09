import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, with later Tailwind utilities winning over earlier ones.
 *
 * `clsx` handles conditionals; `twMerge` resolves conflicts (`px-2 px-4` → `px-4`)
 * so a `className` prop can always override a component's internal styling
 * without `!important`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
