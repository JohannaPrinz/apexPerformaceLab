import { describe, expect, it } from 'vitest';

import { importExercises } from './import-exercises';

/**
 * The importer writes the relationship type.
 *
 * Before this, `create` omitted it and `update` was empty — 43 alternatives
 * would have landed as `related` on the database default, and a second run
 * would have preserved the mistake rather than fixing it.
 */

describe('the relationship type reaches the database', () => {
  it('is written on create and corrected on update', async () => {
    const upserts: { where: unknown; update: unknown; create: unknown }[] = [];

    const db = {
      exercise: {
        // Serves both lookups the importer makes: the duplicate check needs
        // names, the link pass needs ids.
        findMany: () =>
          Promise.resolve([
            { id: 'id-a', key: 'a', name: 'A', canonicalName: 'A', source: null, sourceId: null },
            { id: 'id-b', key: 'b', name: 'B', canonicalName: 'B', source: null, sourceId: null },
          ]),
        create: () => Promise.resolve({}),
        updateMany: () => Promise.resolve({ count: 1 }),
      },
      exerciseVariant: {
        upsert: (args: { where: unknown; update: unknown; create: unknown }) => {
          upserts.push(args);

          return Promise.resolve({});
        },
      },
    };

    const file = {
      formatVersion: 1 as const,
      exercises: [
        {
          key: 'a',
          name: 'A',
          canonicalName: 'A',
          instructions: ['Eins.', 'Zwei.'],
          primaryMuscles: ['chest'],
          secondaryMuscles: [],
          equipment: ['barbell'],
          category: 'strength',
          forceType: 'push',
          mechanic: 'compound',
          difficulty: 'beginner',
          unilateral: false,
          relationships: [{ key: 'b', type: 'alternative' }],
        },
        {
          key: 'b',
          name: 'B',
          canonicalName: 'B',
          instructions: ['Eins.', 'Zwei.'],
          primaryMuscles: ['chest'],
          secondaryMuscles: [],
          equipment: ['barbell'],
          category: 'strength',
          forceType: 'push',
          mechanic: 'compound',
          difficulty: 'beginner',
          unilateral: false,
        },
      ],
    };

    // The mock implements the three calls the importer makes and nothing else;
    // the cast names that narrowing rather than hiding it.
    await importExercises(db as unknown as Parameters<typeof importExercises>[0], file, {
      organizationId: null,
    });

    expect(upserts).toHaveLength(1);
    // Both halves carry the type. An empty `update` would preserve a wrong kind
    // forever, and a re-import is how a correction reaches the database.
    expect(upserts[0]?.create).toMatchObject({ type: 'alternative' });
    expect(upserts[0]?.update).toEqual({ type: 'alternative' });
  });
});
