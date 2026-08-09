import { z } from 'zod';

/**
 * Cursor pagination is the default across the API.
 *
 * Offset pagination degrades on large, frequently-mutated tables (an athlete's
 * training log is exactly that) and produces duplicate/skipped rows when items
 * are inserted mid-scroll. Cursors stay stable under concurrent writes.
 */
export const paginationInputSchema = z.object({
  /** Opaque cursor pointing at the last item of the previous page. */
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(100).default(25),
});

export type PaginationInput = z.infer<typeof paginationInputSchema>;

export interface Page<TItem> {
  items: TItem[];
  /** `null` when there is no further page. */
  nextCursor: string | null;
}

export const sortDirectionSchema = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof sortDirectionSchema>;

/** Builds a typed sort input bound to a concrete set of sortable fields. */
export function sortInputSchema<const TFields extends readonly [string, ...string[]]>(
  fields: TFields,
) {
  return z.object({
    field: z.enum(fields),
    direction: sortDirectionSchema.default('desc'),
  });
}
