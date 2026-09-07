import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { athleteProcedure } from '@/server/api/trpc';
import { issueUploadTicket, readUploadTicket } from '@/server/upload-ticket';
import { deleteAsset } from '@/services/assets/deletion';
import {
  assetForDownload,
  createFolder,
  deleteFolder,
  listAthleteAssets,
  listFolders,
  prepareResumableUpload,
  registerUploadedAsset,
  renameFolder,
} from '@/services/assets/files';

import { writable } from './writable';

/**
 * The athlete's own files (§18, §21).
 *
 * The second of the two doors onto the same shelves. Its whole difference from
 * the coach's is the question it answers first: **whose files are these?** Here
 * the answer comes from the session and from nowhere else — no procedure below
 * takes an athlete, so there is no parameter to tamper with and no comparison
 * anybody can forget.
 *
 * The services in `services/assets/` are shared; the authorisation is not, and
 * deliberately so. A coach may reach every athlete of their workspace, which is
 * right for them and would be a leak here.
 *
 * Deleting goes through `services/assets/deletion.ts` like every other
 * deletion — the rules about running analyses and evidence for findings are not
 * a coach's rules or an athlete's, they are the record's.
 */

const folderId = z.string().min(1).max(64);
const assetId = z.string().min(1).max(64);
const folderName = z.string().trim().min(1).max(80);

const notFound = () => new TRPCError({ code: 'NOT_FOUND', message: 'Nicht gefunden.' });

/** Turns a folder refusal into a sentence for the person who caused it. */
const folderMessage = (refusal: 'EMPTY_NAME' | 'NAME_TAKEN' | 'NOT_FOUND'): TRPCError =>
  refusal === 'NOT_FOUND'
    ? notFound()
    : new TRPCError({
        code: refusal === 'NAME_TAKEN' ? 'CONFLICT' : 'BAD_REQUEST',
        message:
          refusal === 'NAME_TAKEN'
            ? 'Ein Ordner mit diesem Namen gibt es schon.'
            : 'Bitte einen Namen eingeben.',
      });

/** Why a file may not be put down, in the athlete's language. */
function uploadRefusal(
  refusal: 'TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'EMPTY' | 'STORAGE_FAILED' | 'NOT_UPLOADED',
): TRPCError {
  const messages = {
    TOO_LARGE: 'Die Datei ist zu groß.',
    UNSUPPORTED_TYPE: 'Dieser Dateityp lässt sich hier nicht ablegen.',
    EMPTY: 'Die Datei ist leer.',
    STORAGE_FAILED: 'Der Speicher hat die Datei nicht angenommen.',
    NOT_UPLOADED: 'Die Datei ist nicht vollständig angekommen. Bitte noch einmal versuchen.',
  } as const;

  return new TRPCError({
    code: refusal === 'NOT_UPLOADED' ? 'CONFLICT' : 'BAD_REQUEST',
    message: messages[refusal],
  });
}

export const portalFilesProcedures = {
  /** Everything on this athlete's record: the shelves, and what stands on them. */
  files: athleteProcedure.query(async ({ ctx }) => {
    const [folders, assets] = await Promise.all([
      listFolders(ctx.db, ctx.tenant, ctx.athlete.id),
      listAthleteAssets(ctx.db, ctx.tenant, ctx.athlete.id),
    ]);

    return { folders, assets };
  }),

  createFileFolder: athleteProcedure
    .input(z.object({ name: folderName }))
    .mutation(async ({ ctx, input }) => {
      writable(ctx.athlete);

      // `null`: the athlete created it, the same convention the upload uses.
      const result = await createFolder(ctx.db, ctx.tenant, ctx.athlete.id, input.name, null);
      if (!result.ok) throw folderMessage(result.refusal);

      return result.value;
    }),

  renameFileFolder: athleteProcedure
    .input(z.object({ folderId, name: folderName }))
    .mutation(async ({ ctx, input }) => {
      writable(ctx.athlete);

      const result = await renameFolder(
        ctx.db,
        ctx.tenant,
        ctx.athlete.id,
        input.folderId,
        input.name,
      );

      if (!result.ok) throw folderMessage(result.refusal);

      return { ok: true };
    }),

  /** Removes the shelf. What stood on it stays, loose (§18). */
  deleteFileFolder: athleteProcedure
    .input(z.object({ folderId }))
    .mutation(async ({ ctx, input }) => {
      writable(ctx.athlete);

      if (!(await deleteFolder(ctx.db, ctx.tenant, ctx.athlete.id, input.folderId))) {
        throw notFound();
      }

      return { ok: true };
    }),

  /**
   * Deletes one file for good.
   *
   * The id comes from the request and settles nothing on its own: the file is
   * first read back **scoped to this athlete**, and only that lookup decides
   * whether the shared deletion service is asked about it at all.
   */
  deleteFile: athleteProcedure.input(z.object({ assetId })).mutation(async ({ ctx, input }) => {
    writable(ctx.athlete);

    const own = await assetForDownload(ctx.db, ctx.tenant, ctx.athlete.id, input.assetId);
    if (!own) throw notFound();

    const result = await deleteAsset(ctx.db, ctx.tenant, input.assetId);

    if (result.status === 'DELETED') return { ok: true };

    if (result.status === 'DELETE_BLOCKED_ACTIVE_ANALYSIS') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Diese Datei wird gerade für eine Analyse gebraucht.',
      });
    }

    if (result.status === 'DELETE_BLOCKED_MISSING_INSIGHT_EVIDENCE') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Diese Datei belegt einen Befund und kann derzeit nicht gelöscht werden.',
      });
    }

    if (result.status === 'STORAGE_FAILED') {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Die Datei konnte im Speicher nicht entfernt werden. Bitte später erneut.',
      });
    }

    throw notFound();
  }),

  /**
   * Permission to write one object, for a file too big for a request (§18).
   *
   * The athlete half, and the difference from the coach's is the only thing
   * that matters: **no athlete is named here**. The ticket is issued for the
   * record the session resolves to, so there is nothing in the request that
   * could point it at somebody else.
   */
  createFileUploadTicket: athleteProcedure
    .input(
      z.object({
        fileName: z.string().trim().min(1).max(200),
        mimeType: z.string().trim().min(1).max(120),
        sizeBytes: z.number().int().positive(),
        folderId: folderId.nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      writable(ctx.athlete);

      const prepared = prepareResumableUpload({
        athleteId: ctx.athlete.id,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      });

      if (!prepared.ok) throw uploadRefusal(prepared.refusal);

      return {
        ticket: issueUploadTicket({
          organizationId: ctx.tenant.organizationId,
          athleteId: ctx.athlete.id,
          storageKey: prepared.storageKey,
          mimeType: prepared.mimeType,
          sizeBytes: input.sizeBytes,
          fileName: input.fileName,
          folderId: input.folderId ?? null,
          // The athlete uploads as themselves, so no coach is recorded (§18).
          uploadedByCoachId: null,
        }),
      };
    }),

  /** Files the row once the bytes are in the store, and not before. */
  registerFileUpload: athleteProcedure
    .input(z.object({ ticket: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      writable(ctx.athlete);

      const ticket = readUploadTicket(input.ticket);

      // Bound to this athlete as well as this workspace: a ticket issued for
      // somebody else is not spendable here, whoever is holding it.
      if (
        ticket?.organizationId !== ctx.tenant.organizationId ||
        ticket.athleteId !== ctx.athlete.id
      ) {
        throw notFound();
      }

      const result = await registerUploadedAsset(ctx.db, ctx.tenant, ticket);
      if (!result.ok) throw uploadRefusal(result.refusal);

      return result;
    }),

  /**
   * Proves the caller may put a file on this record, and says where.
   *
   * The bytes do not travel through tRPC — a server action carries them, the
   * way analysis stills already do. What this procedure exists for is the half
   * that must not live in an action: **who is allowed**, answered from the
   * session. The action calls it first and uses what it returns.
   */
  fileUploadTarget: athleteProcedure.query(({ ctx }) => {
    writable(ctx.athlete);

    // The athlete uploads as themselves, so no coach is recorded (§18).
    return { athleteId: ctx.athlete.id, uploadedByCoachId: null };
  }),
};
