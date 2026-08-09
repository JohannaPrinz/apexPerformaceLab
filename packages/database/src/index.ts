export { db, PrismaClient, type PrismaClientInstance } from './client';
export * from './tenant';

/**
 * Re-exported generated model & enum types.
 *
 * Consumers import database types from `@apex/database` rather than reaching
 * into `generated/`, so the generator's output path stays an implementation
 * detail we can change without touching call sites.
 *
 * Prisma 7's `prisma-client` generator suffixes model types with `Model`
 * (`UserModel`). They are aliased back to the bare model name here — that
 * suffix is a generator convention, not part of our domain vocabulary.
 */
export type {
  UserModel as User,
  SessionModel as Session,
  AccountModel as Account,
  VerificationModel as Verification,
  OrganizationModel as Organization,
  MembershipModel as Membership,
  InvitationModel as Invitation,
} from '../generated/prisma/models';

export { MembershipRole, InvitationStatus } from '../generated/prisma/enums';
