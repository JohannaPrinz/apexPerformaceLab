/**
 * Conventional Commits, extended with an explicit scope allowlist.
 *
 * The scopes mirror the repository layout (packages + feature slices) so that
 * `git log --grep` and future changelog generation stay mechanically filterable
 * per module. Add a scope here when you add a package or feature slice.
 *
 * Sub-areas use their parent slice's scope: a change under
 * `features/assessments/measurements` is `feat(assessments):`, one under
 * `features/reports/sharing` is `feat(reports):`.
 *
 * @type {import('@commitlint/types').UserConfig}
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        // Workspaces
        'web',
        'ui',
        'database',
        'domain',
        'auth',
        'config',
        'types',

        // Feature slices — domain core
        'athletes',
        'cases',
        'assessments',
        'insights',
        'recommendations',
        'reports',

        // Feature slices — supporting objects
        'documents',
        'videos',
        'programs',
        'notes',
        'appointments',

        // Feature slices — cross-cutting surfaces
        'timeline',
        'portal',

        // Feature slices — frame
        'dashboard',
        'settings',

        // Cross-cutting
        'api',
        'deps',
        'release',
        'repo',
        'docs',
        'ci',
      ],
    ],
    'scope-empty': [1, 'never'],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0, 'always'],
  },
};
