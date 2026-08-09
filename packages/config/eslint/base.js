import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import turboPlugin from 'eslint-plugin-turbo';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Base ESLint config shared by every workspace.
 *
 * Type-aware linting is enabled via `projectService`, which resolves each file's
 * tsconfig automatically — this avoids maintaining a `project: [...]` array per
 * package as the monorepo grows.
 *
 * `eslintConfigPrettier` must stay last so formatting rules never conflict with
 * Prettier; formatting is Prettier's job, correctness is ESLint's.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export const baseConfig = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/generated/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.node, ...globals.es2023 },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    plugins: {
      turbo: turboPlugin,
      import: importPlugin,
    },
    rules: {
      // Undeclared env vars are a top source of "works on my machine" bugs.
      'turbo/no-undeclared-env-vars': 'error',

      // Unused code: allow the `_` prefix as an explicit "intentionally unused" marker.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // Type-only imports must be explicit — required by `verbatimModuleSyntax`.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',

      // `any` is a warning, not an error: it should be visible in review but must
      // not block a work-in-progress branch from building.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Floating promises silently swallow failures in server actions and jobs.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],

      // Import hygiene: deterministic order keeps diffs small.
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          pathGroups: [
            { pattern: 'react', group: 'external', position: 'before' },
            { pattern: 'next/**', group: 'external', position: 'before' },
            { pattern: '@apex/**', group: 'internal' },
            { pattern: '@/**', group: 'internal', position: 'after' },
          ],
          pathGroupsExcludedImportTypes: ['react', 'next/**'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',
      'import/first': 'error',
      'import/newline-after-import': 'error',

      // `stylisticTypeChecked` turns on `dot-notation`, which would rewrite
      // `process.env['DATABASE_URL']` to dot access. Bracket notation is the
      // deliberate convention for index-signature reads here: it reads as a
      // lookup that may miss (which, under `noUncheckedIndexedAccess`, it is)
      // rather than as a known property, and it keeps env access greppable.
      '@typescript-eslint/dot-notation': ['error', { allowIndexSignaturePropertyAccess: true }],

      // General correctness
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-implicit-coercion': ['error', { boolean: false }],
    },
  },
  {
    // Config and script files run outside the type-aware program.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  eslintConfigPrettier,
];

export default baseConfig;
