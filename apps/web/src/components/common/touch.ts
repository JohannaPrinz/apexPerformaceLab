/**
 * Control sizing for touch-first screens.
 *
 * These are Tailwind class strings, not a new styling layer: the same string was
 * about to be repeated a dozen times across the runner and the builder, and a
 * repeated string drifts.
 *
 * Shared rather than owned by one slice: the assessment runner needed it first,
 * but the case forms sit on the same athlete page and would otherwise be the one
 * place still sized for a mouse. A slice importing another slice's styling
 * constants would have been the wrong kind of coupling.
 *
 * ## Why these screens size differently from the design system default
 *
 * A coach performs a test **standing next to the athlete with a tablet**, often
 * one-handed. The design system's `sm` control is `h-8` — 32px — which is fine
 * for a mouse and too small for a thumb; the usual guidance is a 44px target.
 * Below `lg` these controls therefore grow to `h-11`, and at `lg` they fall back
 * to `h-9`, the design system's own default.
 *
 * That desktop value is a change from `h-8`, and deliberately so: an input
 * smaller than the system default was a one-off, not a decision. Nothing else in
 * the desktop layout moves.
 *
 * ## The 16px rule is not cosmetic
 *
 * iOS Safari zooms the page when a focused input has a font smaller than 16px,
 * and the zoom is what a coach then experiences as "the page scrolls sideways
 * and I cannot find the field again". `text-base` below `lg` is what prevents
 * it; `text-sm` returns on desktop where no zoom happens.
 */

/** A text input or select a coach types measurements into. */
export const TOUCH_FIELD = 'h-11 text-base lg:h-9 lg:text-sm';

/** A button beside such a field, or any primary action during a test. */
export const TOUCH_BUTTON = 'h-11 lg:h-9';

/**
 * A control that sizes itself from its content — a tab, a segment of a toggle
 * group. `min-h` rather than `h` so a wrapped label still grows the target.
 */
export const TOUCH_TARGET = 'min-h-11 lg:min-h-8';

/**
 * The visible focus ring for a hand-rolled `<button>`.
 *
 * `@apex/ui`'s `Button` carries this already; the elements that are plain
 * `<button>` because they are chips, tabs or segments do not — and several of
 * them had no focus style at all, which leaves a keyboard user unable to see
 * where they are. Same declaration as the design system uses, so the two look
 * identical.
 */
export const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
