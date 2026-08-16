import { z } from 'zod';

/**
 * Media references on an exercise.
 *
 * **A reference, not an upload.** This declares *where* a demonstration lives
 * and what it is; nothing here stores bytes, issues signed URLs or manages a
 * bucket. That is deliberate: the catalogue is imported from a source that
 * already hosts its images, and building an upload pipeline before anything
 * needs one would be machinery without a load to carry.
 *
 * ## Why not the `Asset` model
 *
 * `Asset` is bound to an athlete (`athleteId` is not nullable) — it is *this
 * person's* document or video, reached through the context ladder so the
 * timeline stays complete. An exercise demonstration belongs to no athlete: it
 * is catalogue content, shared by every workspace when the exercise is a system
 * one. Widening `Asset` to make its athlete optional would weaken the guarantee
 * that every asset appears on someone's timeline, in exchange for a
 * relationship it does not have.
 *
 * ## Why a JSON column
 *
 * The same reasoning as `AssessmentModule.payload` and `Measurement.context`:
 * the shape is validated here rather than by the database, so extending it is a
 * code change under review. A `exercise_media` table would buy referential
 * integrity for rows that are never queried on their own and never joined —
 * they are read exactly when their exercise is.
 *
 * When uploads do arrive, a stored item gains a `storageKey` beside its `url`
 * and this schema gains one optional field. Nothing in the catalogue changes.
 */

export const EXERCISE_MEDIA_KINDS = ['image', 'video'] as const;
export type ExerciseMediaKind = (typeof EXERCISE_MEDIA_KINDS)[number];

export const exerciseMediaItemSchema = z.object({
  kind: z.enum(EXERCISE_MEDIA_KINDS),
  /**
   * Where the demonstration is served from.
   *
   * `http(s)` only. A `javascript:` or `data:` URL rendered into a page is an
   * injection, and imported catalogue data is exactly the kind of input that
   * should not be trusted to be well-meaning.
   */
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => /^https?:\/\//i.test(value), {
      message: 'Media must be served over http or https.',
    }),
  /** Described for a screen reader, and for a coach browsing without images. */
  alt: z.string().trim().max(300).optional(),
  /** Which step of the instructions this shows, when it shows one. */
  step: z.number().int().min(1).max(50).optional(),
});

export type ExerciseMediaItem = z.infer<typeof exerciseMediaItemSchema>;

/** Null and an empty list mean the same thing, so only one is ever stored. */
export const exerciseMediaSchema = z.array(exerciseMediaItemSchema).max(20);

export type ExerciseMedia = z.infer<typeof exerciseMediaSchema>;

/** Reads a stored `media` column, tolerating a shape that no longer parses. */
export function readExerciseMedia(value: unknown): ExerciseMedia {
  if (value === null || value === undefined) return [];

  const parsed = exerciseMediaSchema.safeParse(value);

  // A malformed media list must not make the exercise unreadable — the movement
  // is still a movement without its picture.
  return parsed.success ? parsed.data : [];
}
