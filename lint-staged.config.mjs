/**
 * lint-staged configuration — pre-commit.
 *
 * Deliberately formatting only, no linting.
 *
 * ESLint is configured per workspace (`apps/web`, `packages/{auth,database,
 * types,ui}` each own a flat `eslint.config.mjs`); there is no root config, by
 * design — the Next.js app and the libraries need different rule sets. But
 * lint-staged always runs from the repository root, so a root `eslint` call
 * finds no configuration at all. Routing staged paths back to their owning
 * workspace would mean up to five ESLint start-ups per commit, which is the
 * wrong trade for a hook that should stay under a second.
 *
 * Linting therefore runs where it belongs: `turbo run lint` in `.husky/pre-push`
 * and in CI, cached per package. Commits stay fast, nothing unlinted reaches the
 * remote.
 *
 * The Prisma entry is a *function* because lint-staged appends matched filenames
 * to a string command, while `prisma format` takes its target through `--schema`
 * and rejects a positional path. A function's return value is used verbatim.
 * `packages/database/prisma.config.ts` is not needed — `--schema` is sufficient.
 *
 * @type {import('lint-staged').Configuration}
 */
export default {
  '*.{ts,tsx,js,jsx,mjs,cjs,json,md,mdx,css,yml,yaml}': ['prettier --write'],

  'packages/database/prisma/schema.prisma': () =>
    'prisma format --schema packages/database/prisma/schema.prisma',
};
