import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  MODULE_CONFIGURATION_VERSION,
  readModuleConfiguration,
  type ModuleConfiguration,
  type ModuleKey,
} from '@apex/domain';
import type { TenantContext } from '@apex/types';

/**
 * The test configurations a workspace saved to reuse.
 *
 * ## Why these are data and the shipped ones are code
 *
 * A shipped template is a global professional statement — the same everywhere,
 * reviewable in a diff, edited by nobody. What a practice settles on is neither
 * global nor reviewable by us: it is their own arrangement of roles and stage
 * counts, and it belongs to their workspace. Two different things, deliberately
 * stored two different ways.
 *
 * ## Why applying one still copies
 *
 * §30 is untouched: applying a template copies its configuration into the
 * module and **no reference is kept**. So renaming or deleting one of these
 * cannot reach a test already created from it — the same structural property
 * the shipped templates have, and for the same reason.
 *
 * ## Why an unreadable payload is dropped rather than repaired
 *
 * A stored configuration is read back through the domain's own schema. One
 * written by a shape this code no longer understands is left out of the list
 * instead of being guessed at: a template that silently proposed something
 * other than what was saved would be worse than one that is missing.
 */

type TemplateDb = Pick<PrismaClientInstance, 'moduleTemplate'>;

export interface OwnTemplate {
  readonly id: string;
  readonly name: string;
  readonly moduleKey: string;
  readonly configuration: ModuleConfiguration;
  readonly createdAt: Date;
}

const select = {
  id: true,
  name: true,
  moduleKey: true,
  payload: true,
  moduleVersion: true,
  createdAt: true,
} as const;

function toTemplate(row: {
  id: string;
  name: string;
  moduleKey: string;
  payload: unknown;
  moduleVersion: number;
  createdAt: Date;
}): OwnTemplate | null {
  const configuration = readModuleConfiguration(row.payload, row.moduleVersion);

  return configuration === null
    ? null
    : {
        id: row.id,
        name: row.name,
        moduleKey: row.moduleKey,
        configuration,
        createdAt: row.createdAt,
      };
}

/** Every template this workspace saved, newest first. */
export async function listOwnTemplates(
  db: TemplateDb,
  tenant: Pick<TenantContext, 'organizationId'>,
): Promise<readonly OwnTemplate[]> {
  const rows = await db.moduleTemplate.findMany({
    where: scoped(tenant, {}),
    select,
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  });

  return rows.flatMap((row) => {
    const template = toTemplate(row);

    return template === null ? [] : [template];
  });
}

/** Saves a configuration under a name the coach chose. */
export async function saveOwnTemplate(
  db: TemplateDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  input: {
    readonly name: string;
    readonly moduleKey: ModuleKey;
    readonly configuration: ModuleConfiguration;
  },
): Promise<OwnTemplate | null> {
  const created = await db.moduleTemplate.create({
    data: withTenant(tenant, {
      name: input.name.trim(),
      moduleKey: input.moduleKey,
      payload: input.configuration as never,
      moduleVersion: MODULE_CONFIGURATION_VERSION,
      createdByCoachId,
    }),
    select,
  });

  return toTemplate(created);
}

/**
 * Renames one, or answers `false` where it is not this workspace's.
 *
 * `updateMany` with the tenant in the filter rather than a bare `update`: an id
 * from elsewhere then changes nothing instead of reaching across a boundary.
 */
export async function renameOwnTemplate(
  db: TemplateDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  templateId: string,
  name: string,
): Promise<boolean> {
  const { count } = await db.moduleTemplate.updateMany({
    where: scoped(tenant, { id: templateId }),
    data: { name: name.trim() },
  });

  return count > 0;
}

/**
 * Deletes one for good.
 *
 * Genuinely deleted, unlike almost everything else in this system: a template
 * is a starting point, not a record. Nothing points at it — the tests made from
 * it carry their own copy — so there is no history to preserve and archiving it
 * would only leave a list nobody can tidy.
 */
export async function deleteOwnTemplate(
  db: TemplateDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  templateId: string,
): Promise<boolean> {
  const { count } = await db.moduleTemplate.deleteMany({
    where: scoped(tenant, { id: templateId }),
  });

  return count > 0;
}
