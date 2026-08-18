import type { PrismaClientInstance } from '@apex/database';

/**
 * Personal workspace provisioning.
 *
 * When someone registers as a coach they get three rows, always together:
 *
 *   User → Coach → Membership → Organization
 *
 * The Organization created here is a **personal workspace**, but that is a
 * product word, not a data-model concept (§5). It is an ordinary Organization
 * with an ordinary `owner` Membership — no flag, no subtype, no second table.
 * That is precisely what keeps the multi-organization future open: joining a
 * practice later is one more Membership, and nothing about the personal
 * workspace has to be unwound.
 *
 * `Coach` carries no `organizationId` and must never gain one (§6). A coach
 * profile belongs to the person; affiliation is the Membership. Everything the
 * coach *authors* is tenant-scoped; the person is not.
 */

/** A slug that cannot be produced from a name, used when nothing survives. */
const FALLBACK_SLUG = 'workspace';

/** Postgres holds `organizations.slug` unique; keep room for a suffix. */
const MAX_SLUG_LENGTH = 40;

/**
 * Derives a URL-safe slug from a workspace name.
 *
 * German names are the normal case here, so `ß` is expanded before the
 * diacritic strip — NFKD leaves it intact, and it would otherwise collapse into
 * a separator ("Straßer" → "stra-er" rather than "strasser").
 */
export function slugifyWorkspaceName(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    // Combining marks left behind by the decomposition above.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  return slug || FALLBACK_SLUG;
}

/**
 * The name a personal workspace starts with.
 *
 * The coach's own name, because it is the only thing known at registration and
 * it reads correctly in a workspace switcher. It is a starting value, not a
 * fixed one — `provisionPersonalWorkspace` accepts an explicit name so a later
 * onboarding step can pass a business name instead, and renaming afterwards is
 * an ordinary organization update.
 */
export function personalWorkspaceName(userName: string): string {
  return userName.trim() || 'My Workspace';
}

/** Six hex characters — enough to break a slug collision without being ugly. */
function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 6);
}

/**
 * Finds a free slug, counting up before falling back to randomness.
 *
 * Runs inside the provisioning transaction. A concurrent registration could
 * still claim the same slug between the check and the insert; that surfaces as
 * a unique-constraint violation, which `provisionPersonalWorkspace` retries.
 */
async function findFreeSlug(
  tx: Pick<PrismaClientInstance, 'organization'>,
  base: string,
): Promise<string> {
  for (let attempt = 1; attempt <= 25; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;

    const taken = await tx.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!taken) return candidate;
  }

  return `${base}-${randomSuffix()}`;
}

export interface ProvisionPersonalWorkspaceInput {
  readonly userId: string;
  /** Used to name the coach profile and, unless overridden, the workspace. */
  readonly userName: string;
  /** An explicit workspace name — a business name captured during onboarding. */
  readonly workspaceName?: string | undefined;
}

export interface ProvisionedWorkspace {
  readonly coachId: string;
  readonly organizationId: string;
  readonly slug: string;
}

/**
 * Creates the coach profile, the personal workspace and the owning membership.
 *
 * **Idempotent.** A user who already has a coach profile is returned unchanged,
 * so a replayed hook, a retried sign-up or a second OAuth link cannot produce a
 * second workspace. The check and the writes share one transaction, so a
 * partial state — a coach without a workspace, a workspace nobody belongs to —
 * cannot be observed.
 *
 * Returns `null` when the user was already provisioned.
 */
export async function provisionPersonalWorkspace(
  db: PrismaClientInstance,
  { userId, userName, workspaceName }: ProvisionPersonalWorkspaceInput,
): Promise<ProvisionedWorkspace | null> {
  // An explicit name wins, but only if it survives trimming — a form that
  // submits whitespace must fall back rather than create a nameless workspace.
  // (`??` would not do this: an empty string is not nullish.)
  const explicit = workspaceName?.trim();
  const name = explicit && explicit.length > 0 ? explicit : personalWorkspaceName(userName);
  const baseSlug = slugifyWorkspaceName(name);

  // One retry only: the sole expected cause is a slug collision with a
  // concurrent registration, and a second pass sees the now-taken slug.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const existing = await tx.coach.findUnique({
          where: { userId },
          select: { id: true },
        });

        if (existing) return null;

        const organization = await tx.organization.create({
          data: { name, slug: await findFreeSlug(tx, baseSlug) },
          select: { id: true, slug: true },
        });

        const coach = await tx.coach.create({
          data: { userId, displayName: personalWorkspaceName(userName) },
          select: { id: true },
        });

        await tx.membership.create({
          data: { userId, organizationId: organization.id, role: 'owner' },
        });

        return {
          coachId: coach.id,
          organizationId: organization.id,
          slug: organization.slug,
        };
      });
    } catch (error) {
      if (attempt === 0 && isUniqueConstraintViolation(error)) continue;
      throw error;
    }
  }

  // Unreachable: the loop either returns or rethrows.
  throw new Error('Failed to provision a personal workspace.');
}

/**
 * Prisma's `P2002`, without importing the error class.
 *
 * The `prisma-client` generator emits its error types into `generated/`, and
 * importing from there would defeat the barrel that keeps that path an
 * implementation detail. The code is stable across Prisma versions.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

/**
 * Resolves the organization a session should start in.
 *
 * **Derived from Membership, never from the coach profile.** `Coach` has no
 * `organizationId` and must not gain one (§6); a coach may belong to several
 * organizations, so "which workspace am I in" is a property of the session, not
 * of the person.
 *
 * Oldest membership first, which for a coach who has only ever self-registered
 * is their personal workspace. Once a workspace switcher exists it will write
 * `Session.activeOrganizationId` explicitly and this only supplies the initial
 * value.
 *
 * Returns `null` for a user with no membership — a legitimate state for an
 * athlete portal account, so it must not be treated as an error here.
 */
export async function resolveInitialOrganizationId(
  db: PrismaClientInstance,
  userId: string,
): Promise<string | null> {
  const membership = await db.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true },
  });

  return membership?.organizationId ?? null;
}

/**
 * The organization a session should start in, provisioning one if it is missing.
 *
 * ## Why this exists
 *
 * `user.create.after` and `session.create.before` are **not sequenced** by
 * Better Auth. Measured on a real registration: the user row was written at
 * `…00.255`, the session at `…00.354`, and the membership only at `…00.669` —
 * the session was created 315 ms *before* the membership existed. So
 * `resolveInitialOrganizationId` alone found nothing and stored `null`, and the
 * very first session after registering had no tenant scope. Every later
 * sign-in was correct, which is what made this easy to miss.
 *
 * Ordering the calls here is deliberate:
 *
 * 1. **Resolve first.** For every sign-in after the first this is the only
 *    query, so the normal path costs exactly what it did before.
 * 2. **Read the user** only when that came back empty. The session hook is
 *    handed a `userId` and no name, and provisioning without one would name the
 *    workspace "My Workspace" whenever the session hook wins the race — the
 *    workspace name would depend on timing.
 * 3. **Provision idempotently**, which closes the race from the other side: if
 *    the user hook is still in flight, whichever transaction commits second
 *    hits `Coach.userId @unique`, rolls its organization back, and returns
 *    `null`.
 * 4. **Resolve again** in exactly that case — the coach already existed, so the
 *    membership the other transaction wrote is now visible.
 *
 * ## The low-level guard, and what it is not
 *
 * A `userId` with no user row provisions **nothing** and yields `null`. That is
 * safety at this level: a phantom or deleted session must never conjure a
 * workspace, and there is no name to build one from anyway.
 *
 * It is *not* the athlete gate. This function will happily provision for any
 * user that exists, because deciding **who deserves a workspace** is a policy
 * question and it is answered at the auth boundary in `server.ts`, where the
 * MVP assumption "everyone who registers is a coach" is stated. When athlete
 * portal accounts arrive (§21) that gate moves — here it would have to be
 * repeated at every call site.
 */
export async function ensureActiveOrganizationId(
  db: PrismaClientInstance,
  userId: string,
): Promise<string | null> {
  const existing = await resolveInitialOrganizationId(db, userId);
  if (existing !== null) return existing;

  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) return null;

  const provisioned = await provisionPersonalWorkspace(db, { userId, userName: user.name });
  if (provisioned) return provisioned.organizationId;

  // Provisioning declined because a coach profile already existed — the user
  // hook won the race between our resolve above and our call. Its membership
  // is committed by now.
  return resolveInitialOrganizationId(db, userId);
}
