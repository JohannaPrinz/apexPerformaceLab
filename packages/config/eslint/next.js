import nextPlugin from '@next/eslint-plugin-next';

import { reactConfig } from './react.js';

/**
 * ESLint config for the Next.js application workspace.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export const nextConfig = [
  ...reactConfig,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    // Server-side entry points legitimately log to stdout.
    files: ['**/instrumentation.ts', '**/trigger/**/*.ts', '**/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];

export default nextConfig;
