import { nextConfig } from '@apex/config/eslint/next';

export default [
  ...nextConfig,
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
  {
    /**
     * Architectural boundaries, enforced by the linter rather than by
     * convention — a rule nobody can accidentally forget.
     */
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*/*'],
              message:
                'Import a feature slice through its index.ts, never its internals. Shared code belongs in @apex/types, src/lib, or src/services.',
            },
          ],
        },
      ],
    },
  },
  {
    /**
     * Client components must not reach into the server graph. Without this, an
     * accidental `@apex/database` import in a 'use client' file fails at build
     * time with an opaque bundling error instead of a clear lint message.
     */
    files: ['src/components/**/*.tsx', 'src/features/**/components/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@apex/database',
              message: 'Database access belongs in a server/ module, not in a component.',
            },
            {
              name: '@apex/auth',
              message: 'Use @apex/auth/client in components; the server instance is server-only.',
            },
          ],
        },
      ],
    },
  },
];
