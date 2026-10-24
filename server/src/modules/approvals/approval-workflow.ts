import {
  APPROVAL_LEVEL_LABELS,
  canActOnStep,
  formatRupiah,
  isSelfApprovalLevel,
  type MemoStatus,
} from '@sipita/shared';
import { writeAuditLog } from '../../lib/audit.js';
import type { Email } from '../../lib/mailer.js';
import type { TxClient } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { DOCUMENT_PREFIX, nextDocumentNumber } from '../../utils/numbering.js';
import { resolveApprovalLevels } from '../approval-rules/approval-rules.service.js';
import {
  findApproverIds,
  findUserIdsByRole,
  notifyUsers,
} from '../notifications/notifications.service.js';
import { transitionPr } from '../purchase-requests/pr-status.js';

/*
 * Multi-level approval (CLAUDE.md §5). Every function runs inside the caller's transaction
 * and returns the emails to send after commit.
 *
 * Step lifecycle: WAITING → PENDING (its turn) → APPROVED | REJECTED, or SKIPPED when the
 * requester is an approver of that level, or when the memo ends early (rejected/cancelled).
 */

const MEMO = 'InternalMemo';
const levelLabel = (level: number) => APPROVAL_LEVEL_LABELS[level] ?? `Level ${level}`;
const prLink = (prId: string) => `/pengajuan/${prId}`;

async function loadRequester(tx: TxClient, userId: string) {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      isActive: true,
      approvalLevel: true,
      roles: { select: { role: { select: { code: true } } } },
    },
  });
  return {
    isActive: user.isActive,
    approvalLevel: user.approvalLevel,
    roles: user.roles.map((r) => r.role.code),
  };
}

function memoBody(pr: {
  title: string;
  justification: string;
  estimatedTotal: { toString(): string };
  division: { name: string };
  stockCheckNotes: string | null;
}): string {
  return [
    'Dengan hormat,',
    `Sehubungan dengan kebutuhan Divisi ${pr.division.name}, bersama ini kami mengajukan permohonan pengadaan "${pr.title}" dengan estimasi total ${formatRupiah(pr.estimatedTotal.toString())} sebagaimana rincian terlampir.`,
    `Justifikasi:\n${pr.justification}`,
    `Hasil pengecekan Gudang IT: barang belum tersedia di stok${pr.stockCheckNotes ? ` (${pr.stockCheckNotes})` : ''}.`,
    'Demikian memo ini kami sampaikan. Atas perhatian dan persetujuannya kami ucapkan terima kasih.',
  ].join('\n\n');
}

async function setMemoStatus(
  tx: TxClient,
  memo: { id: string; status: MemoStatus },
  to: MemoStatus,
  actor: Actor,
) {
  await tx.internalMemo.update({
    where: { id: memo.id },
    data: { status: to, ...(to !== 'PENDING' && { decidedAt: new Date() }) },
  });
  await writeAuditLog(tx, {
    actor,
    action: 'STATUS_CHANGE',
    entity: MEMO,
    entityId: memo.id,
    before: { status: memo.status },
    after: { status: to },
  });
}

/**
 * Moves the memo forward: skips self-approval levels, opens the next step, or — when no
 * step is left — approves the memo and the PR.
 */
async function advance(tx: TxClient, memoId: string, actor: Actor): Promise<Email[]> {
  const memo = await tx.internalMemo.findUniqueOrThrow({
    where: { id: memoId },
    select: {
      id: true,
      number: true,
      status: true,
      steps: { orderBy: { sequence: 'asc' }, select: { id: true, level: true, status: true } },
      pr: {
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          requesterId: true,
          estimatedTotal: true,
        },
      },
    },
  });
  if (memo.steps.some((s) => s.status === 'PENDING' || s.status === 'REJECTED')) return [];

  const requester = await loadRequester(tx, memo.pr.requesterId);
  const now = new Date();

  for (const step of memo.steps.filter((s) => s.status === 'WAITING')) {
    if (isSelfApprovalLevel(requester, step.level)) {
      await tx.approvalStep.update({
        where: { id: step.id },
        data: {
          status: 'SKIPPED',
          actedAt: now,
          comment: 'Dilewati otomatis: pemohon adalah approver level ini',
        },
      });
      continue;
    }

    await tx.approvalStep.update({
      where: { id: step.id },
      data: { status: 'PENDING', pendingSince: now },
    });
    return notifyUsers(tx, await findApproverIds(tx, step.level), {
      type: 'APPROVAL_REQUIRED',
      title: `Persetujuan diperlukan: ${memo.pr.number}`,
      message: `${memo.number} — "${memo.pr.title}" (${formatRupiah(memo.pr.estimatedTotal.toString())}) menunggu persetujuan Anda sebagai ${levelLabel(step.level)}.`,
      link: prLink(memo.pr.id),
      email: true,
    });
  }

  // Every step is approved or skipped.
  await setMemoStatus(tx, memo, 'APPROVED', actor);
  await transitionPr(tx, memo.pr, 'APPROVED', actor, {}, `Disetujui melalui ${memo.number}`);
  const toRequester = await notifyUsers(tx, [memo.pr.requesterId], {
    type: 'PR_APPROVED',
    title: `Pengajuan disetujui: ${memo.pr.number}`,
    message: `Pengajuan "${memo.pr.title}" telah disetujui seluruh level dan diteruskan ke Pengadaan.`,
    link: prLink(memo.pr.id),
    email: true,
  });
  await notifyUsers(tx, await findUserIdsByRole(tx, 'PROCUREMENT'), {
    type: 'PR_READY_FOR_QUOTATION',
    title: `Siap diproses: ${memo.pr.number}`,
    message: `Pengajuan "${memo.pr.title}" telah disetujui. Silakan siapkan penawaran vendor.`,
    link: prLink(memo.pr.id),
  });
  return toRequester;
}

/** Creates the memo and its steps for a PR entering PENDING_APPROVAL, then opens the first step. */
export async function startApproval(tx: TxClient, prId: string, actor: Actor): Promise<Email[]> {
  const pr = await tx.purchaseRequest.findUniqueOrThrow({
    where: { id: prId },
    select: {
      id: true,
      number: true,
      title: true,
      justification: true,
      estimatedTotal: true,
      stockCheckNotes: true,
      requesterId: true,
      division: { select: { name: true } },
    },
  });
  const { rule, levels } = await resolveApprovalLevels(pr.estimatedTotal, tx);
  const number = await nextDocumentNumber(tx, DOCUMENT_PREFIX.MEMO);

  const memo = await tx.internalMemo.create({
    data: {
      number,
      prId: pr.id,
      subject: `Permohonan Pengadaan: ${pr.title}`,
      body: memoBody(pr),
      totalAmount: pr.estimatedTotal,
      approvalRuleId: rule.id,
      createdById: actor.userId,
      steps: { create: levels.map((level, i) => ({ level, sequence: i + 1 })) },
    },
    select: { id: true, number: true },
  });
  await writeAuditLog(tx, {
    actor,
    action: 'CREATE',
    entity: MEMO,
    entityId: memo.id,
    after: { number: memo.number, prId: pr.id, levels, approvalRule: rule.name },
  });

  await notifyUsers(tx, [pr.requesterId], {
    type: 'PR_IN_APPROVAL',
    title: `Pengajuan masuk approval: ${pr.number}`,
    message: `Barang belum tersedia di gudang. ${memo.number} dibuat dan diteruskan untuk persetujuan: ${levels.map(levelLabel).join(' → ')}.`,
    link: prLink(pr.id),
  });
  return advance(tx, memo.id, actor);
}

/** Loads a step and checks the actor may decide it, reading the approver level fresh from the DB. */
async function loadStepForDecision(tx: TxClient, stepId: string, actor: Actor) {
  const step = await tx.approvalStep.findUnique({
    where: { id: stepId },
    select: {
      id: true,
      level: true,
      status: true,
      memo: {
        select: {
          id: true,
          number: true,
          status: true,
          pr: { select: { id: true, number: true, title: true, status: true, requesterId: true } },
        },
      },
    },
  });
  if (!step) throw AppError.notFound('Langkah approval tidak ditemukan');

  const user = await loadRequester(tx, actor.userId);
  const ref = { level: step.level, status: step.status, requesterId: step.memo.pr.requesterId };
  if (
    !canActOnStep(ref, { id: actor.userId, roles: user.roles, approvalLevel: user.approvalLevel })
  ) {
    if (step.status !== 'PENDING')
      throw new AppError(409, 'STEP_ALREADY_DECIDED', 'Langkah approval ini sudah diproses');
    throw AppError.forbidden(
      `Hanya approver ${levelLabel(step.level)} yang dapat memproses langkah ini`,
    );
  }
  return step;
}

/** Marks a PENDING step decided; fails if another approver decided it first. */
async function decideStep(
  tx: TxClient,
  stepId: string,
  status: 'APPROVED' | 'REJECTED',
  comment: string | null,
  actor: Actor,
) {
  const { count } = await tx.approvalStep.updateMany({
    where: { id: stepId, status: 'PENDING' },
    data: { status, comment, approverId: actor.userId, actedAt: new Date() },
  });
  if (count === 0)
    throw new AppError(
      409,
      'STEP_ALREADY_DECIDED',
      'Langkah approval ini sudah diproses oleh approver lain',
    );
}

export async function approveStep(
  tx: TxClient,
  stepId: string,
  comment: string | null,
  actor: Actor,
): Promise<Email[]> {
  const step = await loadStepForDecision(tx, stepId, actor);
  await decideStep(tx, stepId, 'APPROVED', comment, actor);
  await writeAuditLog(tx, {
    actor,
    action: 'APPROVE',
    entity: MEMO,
    entityId: step.memo.id,
    after: { stepId, level: step.level, comment },
  });
  return advance(tx, step.memo.id, actor);
}

export async function rejectStep(
  tx: TxClient,
  stepId: string,
  reason: string,
  actor: Actor,
): Promise<Email[]> {
  const step = await loadStepForDecision(tx, stepId, actor);
  const { memo } = step;
  await decideStep(tx, stepId, 'REJECTED', reason, actor);
  await tx.approvalStep.updateMany({
    where: { memoId: memo.id, status: 'WAITING' },
    data: { status: 'SKIPPED' },
  });
  await writeAuditLog(tx, {
    actor,
    action: 'REJECT',
    entity: MEMO,
    entityId: memo.id,
    after: { stepId, level: step.level, reason },
  });
  await setMemoStatus(tx, memo, 'REJECTED', actor);
  await transitionPr(
    tx,
    memo.pr,
    'REJECTED',
    actor,
    {},
    `Ditolak oleh ${levelLabel(step.level)}: ${reason}`,
  );

  return notifyUsers(tx, [memo.pr.requesterId], {
    type: 'PR_REJECTED',
    title: `Pengajuan ditolak: ${memo.pr.number}`,
    message: `Pengajuan "${memo.pr.title}" ditolak oleh ${levelLabel(step.level)}. Alasan: ${reason}`,
    link: prLink(memo.pr.id),
    email: true,
  });
}

/** Stops a pending memo when its PR is cancelled. */
export async function cancelApproval(tx: TxClient, prId: string, actor: Actor): Promise<void> {
  const memo = await tx.internalMemo.findUnique({
    where: { prId },
    select: { id: true, status: true },
  });
  if (!memo || memo.status !== 'PENDING') return;
  await tx.approvalStep.updateMany({
    where: { memoId: memo.id, status: { in: ['PENDING', 'WAITING'] } },
    data: { status: 'SKIPPED', comment: 'Pengajuan dibatalkan' },
  });
  await setMemoStatus(tx, memo, 'CANCELLED', actor);
}
