/**
 * Tailwind CSS v4 needs no JavaScript config file — the theme is declared in
 * CSS via `@theme` in `packages/ui/src/styles/globals.css`. This PostCSS plugin
 * is the entire build integration.
 *
 * @type {import('postcss-load-config').Config}
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
