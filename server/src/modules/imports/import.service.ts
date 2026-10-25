import type {
  ImportBatchDto,
  ImportConflictDto,
  ImportIssueDto,
  ImportPhase,
  importIssueQuerySchema,
  importListQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { readStoredFile, removeFile, saveFile } from '../../lib/storage.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { matchesSignature } from '../../utils/fileSignature.js';
import { pageArgs, pageMeta } from '../../utils/pagination.js';
import type { UploadedFile } from '../attachments/attachments.service.js';
import { getSettings } from '../settings/settings.service.js';
import { applyPlan, planSize, type CommitSummary } from './import.commit.js';
import { parseWorkbook, type Issue } from './import.parse.js';
import { buildPlan } from './import.plan.js';
import { findConflicts, performRollback } from './import.rollback.js';
import { buildTemplate } from './import.template.js';

/**
 * Excel import (CLAUDE.md §7): upload → validate (PREVIEW) → commit (COMMITTED) → optional
 * rollback (ROLLED_BACK). Validation, commit and rollback run in the background so large
 * files never block a request; the batch's `phase` and an in-memory progress counter let
 * the page poll its state.
 */

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** A commit of thousands of rows can take minutes inside its single transaction. */
const COMMIT_TIMEOUT_MS = 30 * 60_000;

const progress = new Map<string, { done: number; total: number }>();
const running = new Map<string, Promise<void>>();

const batchSelect = {
  id: true,
  fileName: true,
  filePath: true,
  status: true,
  phase: true,
  totalRows: true,
  validRows: true,
  warningRows: true,
  errorRows: true,
  errorMessage: true,
  summary: true,
  uploadedAt: true,
  committedAt: true,
  rolledBackAt: true,
  uploadedBy: { select: { id: true, name: true } },
} satisfies Prisma.ImportBatchSelect;

type BatchRecord = Prisma.ImportBatchGetPayload<{ select: typeof batchSelect }>;

async function toDto(b: BatchRecord): Promise<ImportBatchDto> {
  const counts = await prisma.importRowIssue.groupBy({
    by: ['sheet', 'level'],
    where: { batchId: b.id },
    _count: { _all: true },
    orderBy: [{ sheet: 'asc' }, { level: 'asc' }],
  });
  const p = progress.get(b.id);
  return {
    id: b.id,
    fileName: b.fileName,
    status: b.status,
    phase: b.phase as ImportPhase | null,
    progress: b.phase && p ? Math.round((p.done / Math.max(1, p.total)) * 100) : b.phase ? 0 : null,
    totalRows: b.totalRows,
    validRows: b.validRows,
    warningRows: b.warningRows,
    errorRows: b.errorRows,
    errorMessage: b.errorMessage,
    summary: b.summary as CommitSummary | null,
    issueCounts: counts.map((c) => ({ sheet: c.sheet, level: c.level, count: c._count._all })),
    uploadedBy: b.uploadedBy,
    uploadedAt: iso(b.uploadedAt),
    committedAt: iso(b.committedAt),
    rolledBackAt: iso(b.rolledBackAt),
  };
}

async function findOrThrow(id: string): Promise<BatchRecord> {
  const batch = await prisma.importBatch.findUnique({ where: { id }, select: batchSelect });
  if (!batch) throw AppError.notFound('Batch import tidak ditemukan');
  return batch;
}

const userMessage = (err: unknown) =>
  err instanceof AppError ? err.message : 'Terjadi kesalahan saat memproses file. Hubungi admin.';

/** Starts a background step; errors are stored on the batch instead of being thrown. */
function runInBackground(
  batchId: string,
  phase: ImportPhase,
  work: () => Promise<void>,
  onError: (message: string) => Prisma.ImportBatchUpdateInput,
) {
  progress.set(batchId, { done: 0, total: 1 });
  const task = (async () => {
    try {
      await work();
    } catch (err) {
      logger.error({ err, batchId, phase }, 'Proses import gagal');
      await prisma.importBatch.update({
        where: { id: batchId },
        data: { ...onError(userMessage(err)), phase: null },
      });
    } finally {
      progress.delete(batchId);
      running.delete(batchId);
    }
  })();
  running.set(batchId, task);
}

/** Resolves when the batch's background step has finished (used by tests). */
export async function settled(batchId: string): Promise<void> {
  await running.get(batchId);
}

async function saveIssues(batchId: string, issues: Issue[]): Promise<void> {
  await prisma.importRowIssue.deleteMany({ where: { batchId } });
  for (let i = 0; i < issues.length; i += 1000) {
    await prisma.importRowIssue.createMany({
      data: issues.slice(i, i + 1000).map((x) => ({ ...x, batchId })),
    });
  }
}

/** Parses and validates the stored file; the issues and counts form the preview. */
async function evaluate(batchId: string, filePath: string) {
  const settings = await getSettings();
  const parsed = await parseWorkbook(await readStoredFile(filePath));
  progress.set(batchId, { done: 1, total: 2 });
  const result = await buildPlan(parsed, settings);
  await saveIssues(batchId, result.issues);
  await prisma.importBatch.update({ where: { id: batchId }, data: result.counts });
  return { ...result, settings };
}

// ─── API ─────────────────────────────────────────────────────────────────────

export async function template(): Promise<Buffer> {
  return buildTemplate(await getSettings());
}

export async function upload(
  file: UploadedFile | undefined,
  actor: Actor,
): Promise<ImportBatchDto> {
  if (!file) throw AppError.badRequest('File Excel wajib diunggah');
  if (!matchesSignature(file.buffer, XLSX_MIME)) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'File bukan Excel .xlsx yang valid');
  }
  const filePath = await saveFile(file.buffer, file.originalname);
  const batch = await prisma.importBatch.create({
    data: {
      fileName: file.originalname,
      filePath,
      uploadedById: actor.userId,
      phase: 'VALIDATING',
    },
    select: batchSelect,
  });
  runInBackground(
    batch.id,
    'VALIDATING',
    async () => {
      await evaluate(batch.id, filePath);
      await prisma.importBatch.update({ where: { id: batch.id }, data: { phase: null } });
    },
    (message) => ({ status: 'FAILED', errorMessage: message }),
  );
  return toDto(batch);
}

export async function list(q: z.output<typeof importListQuerySchema>) {
  const where: Prisma.ImportBatchWhereInput = {
    ...(q.status && { status: q.status }),
    ...(q.search && { fileName: { contains: q.search, mode: 'insensitive' } }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.importBatch.findMany({
      where,
      select: batchSelect,
      orderBy: { uploadedAt: 'desc' },
      ...pageArgs(q),
    }),
    prisma.importBatch.count({ where }),
  ]);
  return { data: await Promise.all(rows.map(toDto)), meta: pageMeta(q, total) };
}

export async function get(id: string): Promise<ImportBatchDto> {
  return toDto(await findOrThrow(id));
}

export async function issues(id: string, q: z.output<typeof importIssueQuerySchema>) {
  await findOrThrow(id);
  const where: Prisma.ImportRowIssueWhereInput = {
    batchId: id,
    ...(q.level && { level: q.level }),
    ...(q.sheet && { sheet: q.sheet }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.importRowIssue.findMany({
      where,
      select: { id: true, sheet: true, rowNumber: true, level: true, field: true, message: true },
      orderBy: [{ level: 'asc' }, { sheet: 'asc' }, { rowNumber: 'asc' }],
      ...pageArgs(q),
    }),
    prisma.importRowIssue.count({ where }),
  ]);
  return { data: rows satisfies ImportIssueDto[], meta: pageMeta(q, total) };
}

function assertIdle(batch: BatchRecord) {
  if (batch.phase) throw AppError.conflict('Batch ini masih diproses, tunggu hingga selesai');
}

/**
 * Saves the rows without ERROR (warnings included) in one transaction. The file is
 * validated again first, since data may have changed since the preview.
 */
export async function commit(id: string, actor: Actor): Promise<ImportBatchDto> {
  const batch = await findOrThrow(id);
  assertIdle(batch);
  if (batch.status !== 'PREVIEW')
    throw AppError.badRequest('Hanya batch pratinjau yang dapat disimpan');
  await prisma.importBatch.update({
    where: { id },
    data: { phase: 'COMMITTING', errorMessage: null },
  });

  runInBackground(
    id,
    'COMMITTING',
    async () => {
      const { plan, settings } = await evaluate(id, batch.filePath!);
      const total = planSize(plan);
      progress.set(id, { done: 0, total });
      const summary = await prisma.$transaction(
        (tx) =>
          applyPlan(tx, plan, { batchId: id, fileName: batch.fileName, actor, settings }, (done) =>
            progress.set(id, { done, total }),
          ),
        { timeout: COMMIT_TIMEOUT_MS, maxWait: 10_000 },
      );
      // Set after the transaction: rows touched later than this count as later changes.
      await prisma.importBatch.update({
        where: { id },
        data: { status: 'COMMITTED', committedAt: new Date(), summary, phase: null },
      });
    },
    (message) => ({ errorMessage: `Penyimpanan gagal, tidak ada data yang tersimpan. ${message}` }),
  );
  return get(id);
}

/** Discards a preview (no data was written). */
export async function cancel(id: string): Promise<void> {
  const batch = await findOrThrow(id);
  assertIdle(batch);
  if (batch.status === 'COMMITTED') {
    throw AppError.badRequest('Batch yang sudah disimpan hanya dapat dibatalkan lewat rollback');
  }
  if (batch.status === 'ROLLED_BACK') throw AppError.badRequest('Batch ini sudah di-rollback');
  await prisma.importBatch.delete({ where: { id } });
  if (batch.filePath) await removeFile(batch.filePath);
}

export async function rollback(id: string, actor: Actor): Promise<ImportBatchDto> {
  const batch = await findOrThrow(id);
  assertIdle(batch);
  if (batch.status !== 'COMMITTED' || !batch.committedAt) {
    throw AppError.badRequest('Hanya batch yang sudah disimpan yang dapat di-rollback');
  }
  const conflicts: ImportConflictDto[] = await findConflicts(id, batch.committedAt);
  if (conflicts.length > 0) {
    throw new AppError(
      409,
      'IMPORT_ROLLBACK_CONFLICT',
      'Rollback ditolak: sebagian data dari batch ini sudah diubah setelah import',
      conflicts,
    );
  }
  await prisma.importBatch.update({
    where: { id },
    data: { phase: 'ROLLING_BACK', errorMessage: null },
  });
  const settings = await getSettings();
  runInBackground(
    id,
    'ROLLING_BACK',
    async () => {
      await prisma.$transaction((tx) => performRollback(tx, id, actor, settings), {
        timeout: COMMIT_TIMEOUT_MS,
        maxWait: 10_000,
      });
      await prisma.importBatch.update({ where: { id }, data: { phase: null } });
    },
    (message) => ({ errorMessage: `Rollback gagal, data tidak berubah. ${message}` }),
  );
  return get(id);
}

/** After a restart, steps that were running are marked as interrupted. */
export async function recoverInterrupted(): Promise<void> {
  const stuck = await prisma.importBatch.findMany({ where: { phase: { not: null } } });
  for (const b of stuck) {
    await prisma.importBatch.update({
      where: { id: b.id },
      data: {
        phase: null,
        errorMessage: 'Proses terhenti karena server dimulai ulang. Ulangi langkah terakhir.',
        ...(b.phase === 'VALIDATING' && { status: 'FAILED' }),
      },
    });
    await writeAuditLog(prisma, {
      actor: { userId: b.uploadedById, jobLevel: 'STAFF', isAdmin: false, ip: null },
      action: 'STATUS_CHANGE',
      entity: 'ImportBatch',
      entityId: b.id,
      after: { interrupted: b.phase },
    });
  }
}
