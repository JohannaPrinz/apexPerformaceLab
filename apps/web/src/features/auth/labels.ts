/**
 * German wording for membership roles.
 *
 * Same split as the other slices: the vocabulary lives in `@apex/auth`
 * (`permissions.ts`), the words a coach reads live in the application.
 *
 * "Personal Workspace" appears nowhere by design — §5 keeps it an
 * implementation detail, and the workspace shows the name its owner gave it.
 */
export const WORKSPACE_ROLE_LABELS: Readonly<Record<string, string>> = {
  owner: 'Inhaber',
  admin: 'Verwaltung',
  coach: 'Coach',
  athlete: 'Athlet',
};
