import type { AthleteSex } from '@apex/domain';

/**
 * German labels for the athlete slice.
 *
 * Kept out of the components for the same reason as everywhere else: a
 * vocabulary is data, and a screen that spells its own members drifts from the
 * next screen that spells them again.
 */
export const ATHLETE_SEX_LABELS_DE: Readonly<Record<AthleteSex, string>> = {
  male: 'Männlich',
  female: 'Weiblich',
  not_specified: 'Keine Angabe',
};

/**
 * Why the field is asked for at all.
 *
 * Shown beside the control rather than left implicit: a coach entering someone
 * deserves to know that this is not a profile decoration, and that leaving it
 * unanswered has one concrete consequence and no others.
 */
export const ATHLETE_SEX_EXPLANATION =
  'Wird ausschließlich für die Körperfettberechnung nach Jackson & Pollock benötigt — ' +
  'die Formeln sind je Geschlecht unterschiedlich. Ohne Angabe wird kein Körperfettanteil berechnet.';
