import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * The barrel in `src/index.ts` must re-export every model and enum defined in
 * `prisma/schema.prisma`.
 *
 * This is not hypothetical: the barrel was written when the schema held seven
 * models and stayed at seven while the schema grew to thirty. A *missing*
 * re-export produces no type error — it fails only at the first import that
 * needs it, which may be weeks later and in a different package.
 *
 * The comparison is textual on purpose. Model types are erased at runtime, so
 * they cannot be enumerated by importing the barrel; and importing it would
 * pull in `./client`, which wants a live database. Reading both files keeps the
 * test free of environment and connection.
 *
 * Textual matching cannot catch a *wrong* alias (`AthlteModel as Athlete`) —
 * `tsc --noEmit` does, because the source name would not resolve. The two
 * checks are complementary.
 */

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');

const schema = read('../prisma/schema.prisma');
const barrel = read('./index.ts');

/** Declaration names from the schema, e.g. every `model Athlete {`. */
const declared = (keyword: 'model' | 'enum'): string[] =>
  [...schema.matchAll(new RegExp(`^${keyword} (\\w+)`, 'gm'))].map((match) => match[1]!);

/** Alias targets in the barrel, e.g. `Athlete` from `AthleteModel as Athlete`. */
const exportedModels = new Set(
  [...barrel.matchAll(/\b(\w+)Model as (\w+)/g)].map((match) => match[2]!),
);

/** Identifiers inside the `export { … } from '…/enums'` block. */
const exportedEnums = new Set(
  (/export \{([\s\S]*?)\} from '\.\.\/generated\/prisma\/enums';/.exec(barrel)?.[1] ?? '')
    .split('\n')
    .map((line) =>
      line
        .replace(/\/\/.*$/, '')
        .trim()
        .replace(/,$/, ''),
    )
    .filter((line) => /^\w+$/.test(line)),
);

describe('@apex/database barrel', () => {
  it('re-exports every model in the schema', () => {
    const models = declared('model');

    expect(models.length).toBeGreaterThan(0);
    expect(models.filter((name) => !exportedModels.has(name))).toEqual([]);
  });

  it('re-exports every enum in the schema', () => {
    const enums = declared('enum');

    expect(enums.length).toBeGreaterThan(0);
    expect(enums.filter((name) => !exportedEnums.has(name))).toEqual([]);
  });

  it('exports nothing the schema does not declare', () => {
    const models = new Set(declared('model'));
    const enums = new Set(declared('enum'));

    expect([...exportedModels].filter((name) => !models.has(name))).toEqual([]);
    expect([...exportedEnums].filter((name) => !enums.has(name))).toEqual([]);
  });
});
