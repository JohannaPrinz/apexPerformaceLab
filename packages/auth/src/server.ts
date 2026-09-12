import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { organization } from 'better-auth/plugins';

import { db } from '@apex/database';

import { deliverPasswordReset, RESET_TOKEN_SECONDS } from './password-reset';
import { accessControl, roles } from './permissions';
import { activeOrganizationForSession, provisionPersonalWorkspace } from './provisioning';

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

    resetPasswordTokenExpiresIn: RESET_TOKEN_SECONDS,

    /**
     * Every other session ends when a password is reset.
     *
     * Somebody resets because they lost control of the password, or of the
     * device holding a session. Leaving those sessions signed in would make the
     * reset a half-measure: the new password would be correct and the old
     * access would still be open.
     */
    revokeSessionsOnPasswordReset: true,

    /**
     * The link, to the person who asked for it.
     *
     * The URL is built here rather than taken from Better Auth's own `url`,
     * which points at its redirect endpoint. Ours goes straight to the page
     * that takes the new password, so there is one hop and no callback to
     * validate — the token is the same either way.
     *
     * What actually sends is registered by the app; see `password-reset.ts`.
     */
    sendResetPassword: async ({ user, token }) => {
      const base = process.env['BETTER_AUTH_URL'] ?? process.env['NEXT_PUBLIC_APP_URL'] ?? '';

      await deliverPasswordReset({
        to: user.email,
        name: user.name,
        url: `${base}/passwort-neu/${token}`,
        expiresAt: new Date(Date.now() + RESET_TOKEN_SECONDS * 1000),
      });
    },
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
         * **Athlete portal accounts never reach this hook (§21),** and that is
         * load-bearing: an athlete must not receive a coach profile. Activation
         * writes the `User` and its credential row directly — see
         * `features/portal/server/activation.ts` — so Better Auth's public
         * sign-up is not on that path at all. If that ever changes, gate this
         * on whether the user is linked to an Athlete rather than removing it.
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
         * **Everyone who *registers* through Better Auth is a coach**, and every
         * coach gets exactly one personal workspace they own alone. No
         * multi-coach organizations, no shared athletes — see §5 and §25. That
         * assumption is what makes provisioning at sign-in correct rather than
         * presumptuous.
         *
         * `null` is therefore **no longer expected on a normal sign-in.** It
         * now means the user row is gone — a deleted account or a stale
         * session — and `organizationProcedure` refusing it is right.
         *
         * ## The athlete gate (§21)
         *
         * This hook fires on *every* sign-in, and an athlete portal account
         * signs in here like anybody else — so provisioning would hand them a
         * coach profile and a workspace of their own. That is what
         * `activeOrganizationForSession` prevents: an account linked to an
         * Athlete is answered from that Athlete's Workspace and never reaches
         * provisioning.
         *
         * The gate stays at this boundary rather than inside
         * `ensureActiveOrganizationId`: it is a policy about who deserves a
         * workspace, and it should be readable in one place. That function
         * keeps only the low-level guard that a user with no row provisions
         * nothing.
         */
        before: async (session) => ({
          data: {
            ...session,
            activeOrganizationId: await activeOrganizationForSession(db, session.userId),
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
