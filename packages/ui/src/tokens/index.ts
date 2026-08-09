/**
 * Design tokens exposed to TypeScript.
 *
 * CSS variables in `styles/globals.css` are the runtime source of truth. This
 * module exists for the cases CSS cannot reach: chart libraries that need a
 * concrete colour value, canvas/PDF rendering, and email templates.
 *
 * Keep in sync with `styles/globals.css`. A token used only in CSS does not
 * belong here.
 */

export const brand = {
  background: '#F8F8F6',
  primary: '#202124',
  secondary: '#4B5563',
  accent: '#6B8F71',
} as const;

/** Series colours for charts, in the order they should be assigned. */
export const chartColors = ['#6B8F71', '#4A6F8A', '#B8863B', '#8A6F9E', '#A4453C'] as const;

export const chartColorsDark = ['#86AB8C', '#6B93B0', '#D3A45C', '#A88FBB', '#C76259'] as const;

export const statusColors = {
  success: '#4F7A56',
  warning: '#B8863B',
  danger: '#A4453C',
  info: '#4A6F8A',
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
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.625rem',
  xl: '1rem',
  full: '9999px',
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
