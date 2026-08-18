import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { organization } from 'better-auth/plugins';

import { db } from '@apex/database';

import { accessControl, roles } from './permissions';
import { ensureActiveOrganizationId, provisionPersonalWorkspace } from './provisioning';

/**
 * Better Auth server instance — the single source of truth for identity.
 *
 * Why Better Auth over a hosted identity provider: the tenancy model
 * (organizations, memberships, invitations, an *active* organization per
 * session) lives in the same Postgres as the domain data. That lets a single
 * transaction cover "create org + membership + audit row", and keeps
 * authorization queries joinable instead of requiring a round-trip to an
 * external service on every request.
 *
 * The `organization` plugin owns the multi-tenant primitives; its tables are
 * already declared in `packages/database/prisma/schema.prisma`.
 */
export const auth = betterAuth({
  appName: 'Apex OS',

  database: prismaAdapter(db, {
    provider: 'postgresql',
  }),

  secret: process.env['BETTER_AUTH_SECRET'],
  baseURL: process.env['BETTER_AUTH_URL'] ?? process.env['NEXT_PUBLIC_APP_URL'],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    // Flipped on once the Resend transactional templates land — see docs/ROADMAP.md.
    requireEmailVerification: false,
  },

  socialProviders: {
    ...(process.env['GITHUB_CLIENT_ID'] && process.env['GITHUB_CLIENT_SECRET']
      ? {
          github: {
            clientId: process.env['GITHUB_CLIENT_ID'],
            clientSecret: process.env['GITHUB_CLIENT_SECRET'],
          },
        }
      : {}),
    ...(process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET']
      ? {
          google: {
            clientId: process.env['GOOGLE_CLIENT_ID'],
            clientSecret: process.env['GOOGLE_CLIENT_SECRET'],
          },
        }
      : {}),
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh the expiry at most once per day
    cookieCache: {
      // Avoids a database round-trip on every request; the tenant scope is
      // re-read from the session cookie for up to 5 minutes.
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  advanced: {
    database: {
      // Match the `cuid(2)` default used across the Prisma schema.
      generateId: false,
    },
  },

  /**
   * The registration → workspace flow.
   *
   * Both hooks live here rather than in a sign-up handler on purpose: they fire
   * for *every* path Better Auth creates a user or a session through — email
   * and password, GitHub, Google, and any provider added later. A flow wired
   * into one form would silently skip the others, and the first coach to
   * register with Google would land in an account with no workspace.
   */
  databaseHooks: {
    user: {
      create: {
        /**
         * Gives the new coach a profile and a personal workspace.
         *
         * Idempotent, so a retried registration cannot produce a second
         * workspace.
         *
         * **Constraint to respect when athlete portal accounts arrive (§21):**
         * this fires for every user Better Auth creates, and an athlete must
         * not receive a coach profile. Portal activation is a coach-initiated
         * server-side action and will create that `User` directly, bypassing
         * Better Auth's public sign-up — so this hook never sees it. If that
         * ever changes, gate this on the registration intent rather than
         * removing it.
         */
        after: async (user) => {
          await provisionPersonalWorkspace(db, {
            userId: user.id,
            userName: user.name,
          });
        },
      },
    },

    session: {
      create: {
        /**
         * Puts the session into a workspace at sign-in — and provisions one if
         * the coach does not have it yet.
         *
         * The active organization is resolved **from Membership**, never from
         * the coach profile, which holds no organization by design (§6).
         *
         * **Why this also provisions.** Better Auth does not sequence
         * `user.create.after` before this hook. On a real registration the
         * session was written 315 ms *before* the membership existed, so
         * resolving alone stored `null` and the first session after signing up
         * had no tenant scope. `ensureActiveOrganizationId` closes that race
         * from both sides; provisioning is idempotent, so whichever hook gets
         * there first wins and the other returns without writing.
         *
         * ## The MVP assumption, stated here on purpose
         *
         * **Everyone who registers through Better Auth is a coach**, and every
         * coach gets exactly one personal workspace they own alone. No
         * multi-coach organizations, no invitations, no shared athletes — see
         * §5 and §25. That assumption is what makes provisioning at sign-in
         * correct rather than presumptuous.
         *
         * `null` is therefore **no longer expected on a normal sign-in.** It
         * now means the user row is gone — a deleted account or a stale
         * session — and `organizationProcedure` refusing it is right.
         *
         * ## Where the gate moves when athletes arrive (§21)
         *
         * **This is the place to change.** Athlete portal accounts are created
         * server-side by a coach, bypassing public sign-up, so the user hook
         * never sees them — but this hook fires on *every* sign-in, theirs
         * included. Provisioning would hand an athlete a coach profile and a
         * workspace.
         *
         * So when portal accounts land, gate the call below on the registration
         * intent. Do not push that gate down into `ensureActiveOrganizationId`:
         * it is a policy about who deserves a workspace, and it belongs at the
         * auth boundary where it can be read in one place. The function keeps
         * only the low-level guard that a user with no row provisions nothing.
         */
        before: async (session) => ({
          data: {
            ...session,
            activeOrganizationId: await ensureActiveOrganizationId(db, session.userId),
          },
        }),
      },
    },
  },

  plugins: [
    organization({
      ac: accessControl,
      roles,
      allowUserToCreateOrganization: true,
      organizationLimit: 5,
      creatorRole: 'owner',
      membershipLimit: 500,
      invitationExpiresIn: 60 * 60 * 48, // 48 hours
    }),
    // `nextCookies` must stay last: it wraps the response so Better Auth can set
    // cookies from Server Actions.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
export type Session = Auth['$Infer']['Session'];
