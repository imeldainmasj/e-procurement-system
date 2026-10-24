import { randomUUID } from 'node:crypto';
import type { AttachmentDto } from '@sipita/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import { removeFile, saveFile } from '../../lib/storage.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { matchesSignature } from '../../utils/fileSignature.js';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const attachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  size: true,
  path: true,
  refType: true,
  refId: true,
  createdAt: true,
  uploadedById: true,
  uploadedBy: { select: { id: true, name: true } },
} satisfies Prisma.AttachmentSelect;

export type AttachmentRecord = Prisma.AttachmentGetPayload<{ select: typeof attachmentSelect }>;

export function toAttachmentDto(
  a: Omit<AttachmentRecord, 'path' | 'refType' | 'refId' | 'uploadedById'>,
): AttachmentDto {
  return {
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    createdAt: iso(a.createdAt),
    uploadedBy: a.uploadedBy,
  };
}

// ─── Access control ──────────────────────────────────────────────────────────

/** Decides whether `actor` may download an attachment owned by a record of `refType`. */
type AccessCheck = (attachment: AttachmentRecord, actor: Actor) => boolean | Promise<boolean>;
const accessChecks = new Map<string, AccessCheck>();

export function registerAttachmentAccess(refType: string, check: AccessCheck): void {
  accessChecks.set(refType, check);
}

// ─── Storing ─────────────────────────────────────────────────────────────────

/**
 * Validates the upload, writes it to disk and runs `persist` with the stored path. If
 * `persist` throws (e.g. the DB transaction fails), the file is removed again.
 */
export async function withStoredFile<T>(
  file: UploadedFile | undefined,
  persist: (stored: { path: string; attachmentId: string }) => Promise<T>,
): Promise<T> {
  if (!file) throw AppError.badRequest('File wajib diunggah');
  if (!matchesSignature(file.buffer, file.mimetype)) {
    throw new AppError(400, 'INVALID_FILE_CONTENT', 'Isi file tidak sesuai dengan tipenya');
  }
  const path = await saveFile(file.buffer, file.originalname);
  try {
    return await persist({ path, attachmentId: randomUUID() });
  } catch (err) {
    await removeFile(path);
    throw err;
  }
}

export async function createAttachment(
  tx: TxClient,
  file: UploadedFile,
  stored: { path: string; attachmentId: string },
  ref: { type: string; id: string },
  actor: Actor,
): Promise<AttachmentRecord> {
  return tx.attachment.create({
    data: {
      id: stored.attachmentId,
      fileName: file.originalname,
      path: stored.path,
      mimeType: file.mimetype,
      size: file.size,
      refType: ref.type,
      refId: ref.id,
      uploadedById: actor.userId,
    },
    select: attachmentSelect,
  });
}

// ─── Downloading ─────────────────────────────────────────────────────────────

export async function findDownloadable(id: string, actor: Actor): Promise<AttachmentRecord> {
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    select: attachmentSelect,
  });
  if (!attachment) throw AppError.notFound('File tidak ditemukan');

  const check = attachment.refType ? accessChecks.get(attachment.refType) : undefined;
  // Unowned or unknown types: only the uploader and admins.
  const allowed = check
    ? await check(attachment, actor)
    : attachment.uploadedById === actor.userId || actor.isAdmin;
  if (!allowed) throw AppError.notFound('File tidak ditemukan');
  return attachment;
}
