import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { organization } from 'better-auth/plugins';

import { db } from '@apex/database';

import { accessControl, roles } from './permissions';
import { provisionPersonalWorkspace, resolveInitialOrganizationId } from './provisioning';

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
         * Puts the session into a workspace at sign-in.
         *
         * The active organization is resolved **from Membership** — never from
         * the coach profile, which holds no organization by design (§6). This
         * only supplies the initial value; a workspace switcher will later
         * write `activeOrganizationId` explicitly.
         *
         * `null` is a valid result: a user with no membership (a future athlete
         * portal account) gets a session without a tenant scope, and
         * `organizationProcedure` refuses it. That is the correct outcome, not
         * an error to swallow here.
         */
        before: async (session) => ({
          data: {
            ...session,
            activeOrganizationId: await resolveInitialOrganizationId(db, session.userId),
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
