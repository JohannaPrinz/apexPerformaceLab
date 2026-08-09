/**
 * Design tokens exposed to TypeScript.
 *
 * CSS variables in `styles/globals.css` are the runtime source of truth. This
 * module exists for the cases CSS cannot reach: chart libraries that need a
 * concrete colour value, canvas/PDF rendering, and email templates.
 *
 * The brand layer mirrors `docs/design/tokens.json`, exported from the
 * marketing site. Values derived for the product — dark mode, status, chart
 * series — are documented with their measured contrast in `globals.css`.
 *
 * Keep in sync with `styles/globals.css`. A token used only in CSS does not
 * belong here.
 */

export const brand = {
  canvas: '#F7F7F5',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F1EE',
  deep: '#16181A',

  ink: '#16181A',
  inkSoft: '#3D4247',
  inkMuted: '#71777D',
  /** For text below 16px, where `inkMuted` (4.22:1) would fail AA. */
  inkMutedAccessible: '#63696F',

  line: '#E4E4DF',
  lineStrong: '#D3D3CC',

  accent: '#1F7A64',
  accentStrong: '#175D4C',
  accentSoft: '#E8F1EE',
  accentInk: '#0F3F34',
} as const;

/**
 * Series colours for charts, in the order they should be assigned.
 *
 * Chosen by solving for staggered luminance rather than by picking hues: series
 * of equal luminance merge in greyscale and under colour-vision deficiency
 * however different their hue. Colour alone still never carries meaning — pair
 * it with shape, label or pattern.
 */
export const chartColors = ['#1F7A64', '#254962', '#9F392E', '#8E6FAA', '#B38322'] as const;

export const chartColorsDark = ['#3FA88C', '#3F749B', '#D0685C', '#BCA5D0', '#E3BF79'] as const;

/**
 * Success is the brand accent by design: green is already the accent, and a
 * second green beside it reads as noise rather than signal.
 */
export const statusColors = {
  success: '#1F7A64',
  warning: '#96631B',
  danger: '#9E3B33',
  info: '#3D6785',
} as const;

export const statusColorsDark = {
  success: '#3FA88C',
  warning: '#D9A441',
  danger: '#E08A80',
  info: '#7FB0CE',
} as const;

export const fontFamilies = {
  /** Body copy and controls. */
  sans: 'Inter',
  /** Headings. */
  display: 'Manrope',
  /** Figures and micro-labels. */
  mono: 'IBM Plex Mono',
} as const;

/** Spacing scale in rem, matching Tailwind's default 4px base. */
export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
} as const;

export const radius = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '20px',
  xl: '28px',
  pill: '999px',
} as const;

/** One curve for the whole project. */
export const motion = {
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
  durationFast: '200ms',
  durationSlow: '700ms',
} as const;

/** Breakpoints, mirroring Tailwind's defaults. Used by JS-side media queries. */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Brand = typeof brand;
export type ChartColor = (typeof chartColors)[number];
