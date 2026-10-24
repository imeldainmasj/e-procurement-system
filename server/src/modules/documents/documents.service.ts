import {
  MEMO_TYPE_LABELS,
  PROCUREMENT_METHOD_LABELS,
  type MemoDto,
  type MemoPayload,
  type MilestoneType,
  type PaymentTermDto,
  type PaymentTermPayload,
  type PoPayload,
  type PurchaseOrderDto,
  type PvpApprovalDto,
  type PvpApprovalPayload,
  type PvpDto,
  type PvpPayload,
  type RfqDto,
  type RfqPayload,
  type WorkDocumentsDto,
} from '@sipita/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { amountInIdr, num, numOrNull } from '../../utils/money.js';
import { memoMilestone } from '../../utils/procurementRules.js';
import {
  addendumSelect,
  agreementSelect,
  toAddendumDto,
  toAgreementDto,
} from '../agreements/agreements.dto.js';
import { getSettings } from '../settings/settings.service.js';
import { refreshWorkIssues, syncMilestones } from '../works/work-state.js';
import { assertCanModify, dateOnly } from '../works/works.service.js';

const live = { deletedAt: null };
const day = (d: Date) => dateOnly(d)!;
const toDate = (s: string) => new Date(s);

// ─── Shared transaction wrapper ──────────────────────────────────────────────

const workSelect = {
  id: true,
  code: true,
  picId: true,
  method: true,
  pkResult: true,
  sourceAgreementId: true,
  milestones: { select: { type: true } },
} satisfies Prisma.WorkSelect;

export type DocWork = Prisma.WorkGetPayload<{ select: typeof workSelect }>;

export async function findWork(db: TxClient, workId: string): Promise<DocWork> {
  const work = await db.work.findFirst({ where: { id: workId, ...live }, select: workSelect });
  if (!work) throw AppError.notFound('Pekerjaan tidak ditemukan');
  return work;
}

function ruleError(code: string, message: string): AppError {
  return new AppError(422, code, message);
}

/** The work's template must contain the milestone a document completes. */
export function assertHasMilestone(work: DocWork, type: MilestoneType, document: string): void {
  if (!work.milestones.some((m) => m.type === type)) {
    throw ruleError(
      'DOCUMENT_NOT_IN_TEMPLATE',
      `${document} tidak dipakai pada metode ${PROCUREMENT_METHOD_LABELS[work.method]}`,
    );
  }
}

/**
 * Runs a document change for a work: ownership check, the change itself, strict milestone
 * sync (rejects documents whose milestone prerequisites are open, §5.5 rule 7), data-issue
 * refresh and lastUpdatedAt — all in one transaction.
 */
export async function withWorkDocument<T>(
  workId: string,
  actor: Actor,
  reason: string,
  change: (tx: TxClient, work: DocWork) => Promise<T>,
): Promise<T> {
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    const work = await findWork(tx, workId);
    assertCanModify(work, actor);
    const result = await change(tx, work);
    await syncMilestones(tx, workId, settings, { authorId: actor.userId, reason, strict: true });
    await tx.work.update({
      where: { id: workId },
      data: { lastUpdatedAt: new Date(), updatedById: actor.userId },
    });
    await refreshWorkIssues(tx, workId, settings);
    return result;
  });
}

/** Document numbers are unique per type, including soft-deleted rows (§5.5 rule 6). */
export function duplicateNumber(label: string, value: string): AppError {
  return new AppError(409, 'DUPLICATE_DOCUMENT_NUMBER', `${label} ${value} sudah tercatat`);
}

const stamps = (actor: Actor) => ({ createdById: actor.userId, updatedById: actor.userId });

function money(input: { amount: number; currency: string; exchangeRate: number }) {
  return {
    amount: input.amount,
    currency: input.currency,
    exchangeRate: input.exchangeRate,
    amountIdr: amountInIdr(input.amount, input.exchangeRate),
  };
}

// ─── Memo & MoA ──────────────────────────────────────────────────────────────

const memoSelect = {
  id: true,
  memoNo: true,
  memoType: true,
  title: true,
  memoDate: true,
  requesterName: true,
  amount: true,
  currency: true,
  exchangeRate: true,
  amountIdr: true,
  notes: true,
} satisfies Prisma.MemoSelect;

function toMemoDto(m: Prisma.MemoGetPayload<{ select: typeof memoSelect }>): MemoDto {
  return {
    ...m,
    memoDate: day(m.memoDate),
    amount: numOrNull(m.amount),
    exchangeRate: numOrNull(m.exchangeRate),
    amountIdr: numOrNull(m.amountIdr),
  };
}

/** Rule 4 (§5.5): the PK source agreement must be active on the Memo PK date. */
async function assertSourceAgreementActive(tx: TxClient, work: DocWork, memoDate: string) {
  const agreement = work.sourceAgreementId
    ? await tx.agreement.findFirst({
        where: { id: work.sourceAgreementId, ...live },
        select: { status: true, periodStart: true, periodEnd: true },
      })
    : null;
  const active =
    agreement &&
    agreement.status !== 'TERMINATED' &&
    day(agreement.periodStart) <= memoDate &&
    day(agreement.periodEnd) >= memoDate;
  if (!active) {
    throw ruleError(
      'PK_SOURCE_AGREEMENT_INACTIVE',
      'Kontrak sumber PK tidak aktif pada tanggal Memo PK',
    );
  }
}

async function checkMemo(tx: TxClient, work: DocWork, input: MemoPayload, currentId?: string) {
  const milestone = memoMilestone(input.memoType, work.method);
  if (!milestone) {
    throw ruleError(
      'MEMO_TYPE_NOT_ALLOWED',
      `${MEMO_TYPE_LABELS[input.memoType]} tidak sesuai metode ${PROCUREMENT_METHOD_LABELS[work.method]}`,
    );
  }
  assertHasMilestone(work, milestone, MEMO_TYPE_LABELS[input.memoType]);
  const same = await tx.memo.findFirst({
    where: { memoNo: input.memoNo, ...(currentId && { NOT: { id: currentId } }) },
  });
  if (same) throw duplicateNumber('No. memo', input.memoNo);
  if (input.memoType === 'MEMO_PK') await assertSourceAgreementActive(tx, work, input.memoDate);
}

function memoData(input: MemoPayload) {
  return {
    memoNo: input.memoNo,
    memoType: input.memoType,
    title: input.title,
    memoDate: toDate(input.memoDate),
    requesterName: input.requesterName,
    notes: input.notes,
    ...(input.amount === null
      ? { amount: null, currency: null, exchangeRate: null, amountIdr: null }
      : money({ ...input, amount: input.amount })),
  };
}

export async function createMemo(workId: string, input: MemoPayload, actor: Actor) {
  return withWorkDocument(
    workId,
    actor,
    `${MEMO_TYPE_LABELS[input.memoType]} dicatat`,
    async (tx, work) => {
      await checkMemo(tx, work, input);
      const memo = await tx.memo.create({
        data: { workId, ...memoData(input), ...stamps(actor) },
        select: memoSelect,
      });
      const dto = toMemoDto(memo);
      await writeAuditLog(tx, {
        actor,
        action: 'CREATE',
        entity: 'Memo',
        entityId: memo.id,
        after: dto,
      });
      return dto;
    },
  );
}

async function findMemo(tx: TxClient, workId: string, id: string) {
  const memo = await tx.memo.findFirst({ where: { id, workId, ...live }, select: memoSelect });
  if (!memo) throw AppError.notFound('Memo tidak ditemukan');
  return memo;
}

export async function updateMemo(workId: string, id: string, input: MemoPayload, actor: Actor) {
  return withWorkDocument(
    workId,
    actor,
    `${MEMO_TYPE_LABELS[input.memoType]} diperbarui`,
    async (tx, work) => {
      const before = await findMemo(tx, workId, id);
      await checkMemo(tx, work, input, id);
      const memo = await tx.memo.update({
        where: { id },
        data: { ...memoData(input), updatedById: actor.userId },
        select: memoSelect,
      });
      const dto = toMemoDto(memo);
      await writeAuditLog(tx, {
        actor,
        action: 'UPDATE',
        entity: 'Memo',
        entityId: id,
        before: toMemoDto(before),
        after: dto,
      });
      return dto;
    },
  );
}

export async function deleteMemo(workId: string, id: string, actor: Actor) {
  await withWorkDocument(workId, actor, 'dokumen memo dihapus', async (tx) => {
    const before = await findMemo(tx, workId, id);
    await tx.memo.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: actor.userId },
    });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: 'Memo',
      entityId: id,
      before: toMemoDto(before),
    });
  });
}

// ─── RFQ & LoA ───────────────────────────────────────────────────────────────

const rfqSelect = {
  id: true,
  rfqNo: true,
  method: true,
  periodStart: true,
  periodEnd: true,
  amount: true,
  currency: true,
  exchangeRate: true,
  amountIdr: true,
  termOfPayment: true,
  loaNo: true,
  loaDate: true,
  loaProcessedBy: true,
  createdAt: true,
} satisfies Prisma.RfqSelect;

function toRfqDto(r: Prisma.RfqGetPayload<{ select: typeof rfqSelect }>): RfqDto {
  const { createdAt, ...rest } = r;
  return {
    ...rest,
    periodStart: day(r.periodStart),
    periodEnd: day(r.periodEnd),
    amount: num(r.amount),
    exchangeRate: num(r.exchangeRate),
    amountIdr: num(r.amountIdr),
    loaDate: r.loaDate && day(r.loaDate),
    recordedAt: createdAt.toISOString(),
  };
}

/** One RFQ per work; PUT creates or replaces it (the LoA is part of it). */
export async function saveRfq(workId: string, input: RfqPayload, actor: Actor) {
  return withWorkDocument(
    workId,
    actor,
    input.loaNo ? 'RFQ/LoA dicatat' : 'RFQ dicatat',
    async (tx, work) => {
      assertHasMilestone(work, 'RFQ', 'RFQ');
      if (input.loaNo) assertHasMilestone(work, 'LOA', 'LoA');
      const before = await tx.rfq.findFirst({
        where: { workId },
        select: { ...rfqSelect, deletedAt: true },
      });
      const notThis = before ? { NOT: { id: before.id } } : {};
      if (await tx.rfq.findFirst({ where: { rfqNo: input.rfqNo, ...notThis } })) {
        throw duplicateNumber('No. RFQ', input.rfqNo);
      }
      if (input.loaNo && (await tx.rfq.findFirst({ where: { loaNo: input.loaNo, ...notThis } }))) {
        throw duplicateNumber('No. LoA', input.loaNo);
      }
      const data = {
        rfqNo: input.rfqNo,
        method: input.method,
        periodStart: toDate(input.periodStart),
        periodEnd: toDate(input.periodEnd),
        ...money(input),
        termOfPayment: input.termOfPayment,
        loaNo: input.loaNo,
        loaDate: input.loaDate ? toDate(input.loaDate) : null,
        loaProcessedBy: input.loaProcessedBy,
        updatedById: actor.userId,
      };
      // workId is unique even for a soft-deleted RFQ, so a deleted one is revived.
      const rfq = before
        ? await tx.rfq.update({
            where: { id: before.id },
            data: { ...data, deletedAt: null, ...(before.deletedAt && { createdAt: new Date() }) },
            select: rfqSelect,
          })
        : await tx.rfq.create({
            data: { workId, ...data, createdById: actor.userId },
            select: rfqSelect,
          });
      const dto = toRfqDto(rfq);
      await writeAuditLog(tx, {
        actor,
        action: before && !before.deletedAt ? 'UPDATE' : 'CREATE',
        entity: 'Rfq',
        entityId: rfq.id,
        before: before && !before.deletedAt ? toRfqDto(before) : undefined,
        after: dto,
      });
      return dto;
    },
  );
}

export async function deleteRfq(workId: string, actor: Actor) {
  await withWorkDocument(workId, actor, 'RFQ dihapus', async (tx) => {
    const before = await tx.rfq.findFirst({ where: { workId, ...live }, select: rfqSelect });
    if (!before) throw AppError.notFound('RFQ tidak ditemukan');
    await tx.rfq.update({
      where: { id: before.id },
      data: { deletedAt: new Date(), updatedById: actor.userId },
    });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: 'Rfq',
      entityId: before.id,
      before: toRfqDto(before),
    });
  });
}

// ─── PVP Forum ───────────────────────────────────────────────────────────────

const approvalSelect = {
  id: true,
  directorName: true,
  decision: true,
  approvalDate: true,
  notes: true,
} satisfies Prisma.PvpApprovalSelect;

const pvpSelect = {
  id: true,
  pvpDate: true,
  status: true,
  notes: true,
  approvals: { where: live, select: approvalSelect, orderBy: { approvalDate: 'asc' } },
} satisfies Prisma.PvpForumSelect;

type PvpRecord = Prisma.PvpForumGetPayload<{ select: typeof pvpSelect }>;

function toApprovalDto(a: PvpRecord['approvals'][number]): PvpApprovalDto {
  return { ...a, approvalDate: day(a.approvalDate) };
}

function toPvpDto(p: PvpRecord, minApprovals: number): PvpDto {
  return {
    id: p.id,
    pvpDate: day(p.pvpDate),
    status: p.status,
    notes: p.notes,
    approvals: p.approvals.map(toApprovalDto),
    approvedCount: p.approvals.filter((a) => a.decision === 'APPROVED').length,
    minApprovals,
  };
}

/** Rule 3 (§5.5): APPROVED needs at least PVP_MIN_DIRECTOR_APPROVALS director approvals. */
async function assertEnoughApprovals(tx: TxClient, pvpForumId: string | null, extra = 0) {
  const { PVP_MIN_DIRECTOR_APPROVALS: min } = await getSettings(tx);
  const count =
    (pvpForumId
      ? await tx.pvpApproval.count({ where: { pvpForumId, decision: 'APPROVED', ...live } })
      : 0) + extra;
  if (count < min) {
    throw ruleError(
      'PVP_INSUFFICIENT_APPROVALS',
      `PVP membutuhkan minimal ${min} approval direktur (tercatat ${count})`,
    );
  }
}

export async function savePvp(workId: string, input: PvpPayload, actor: Actor) {
  return withWorkDocument(
    workId,
    actor,
    `PVP Forum dicatat (${input.status})`,
    async (tx, work) => {
      assertHasMilestone(work, 'PVP', 'PVP Forum');
      const before = await tx.pvpForum.findFirst({
        where: { workId },
        select: { ...pvpSelect, deletedAt: true },
      });
      const liveBefore = before && !before.deletedAt ? before : null;
      if (input.status === 'APPROVED') await assertEnoughApprovals(tx, liveBefore?.id ?? null);
      const data = {
        pvpDate: toDate(input.pvpDate),
        status: input.status,
        notes: input.notes,
        updatedById: actor.userId,
      };
      const pvp = before
        ? await tx.pvpForum.update({
            where: { id: before.id },
            data: { ...data, deletedAt: null },
            select: pvpSelect,
          })
        : await tx.pvpForum.create({
            data: { workId, ...data, createdById: actor.userId },
            select: pvpSelect,
          });
      const { PVP_MIN_DIRECTOR_APPROVALS: min } = await getSettings(tx);
      const dto = toPvpDto(pvp, min);
      await writeAuditLog(tx, {
        actor,
        action: liveBefore
          ? liveBefore.status !== input.status
            ? 'STATUS_CHANGE'
            : 'UPDATE'
          : 'CREATE',
        entity: 'PvpForum',
        entityId: pvp.id,
        before: liveBefore ? toPvpDto(liveBefore, min) : undefined,
        after: dto,
      });
      return dto;
    },
  );
}

async function findLivePvp(tx: TxClient, workId: string) {
  const pvp = await tx.pvpForum.findFirst({ where: { workId, ...live }, select: pvpSelect });
  if (!pvp) throw AppError.badRequest('Catat data PVP Forum terlebih dahulu');
  return pvp;
}

export async function deletePvp(workId: string, actor: Actor) {
  await withWorkDocument(workId, actor, 'PVP Forum dihapus', async (tx) => {
    const pvp = await findLivePvp(tx, workId);
    const now = new Date();
    await tx.pvpApproval.updateMany({
      where: { pvpForumId: pvp.id, ...live },
      data: { deletedAt: now },
    });
    await tx.pvpForum.update({
      where: { id: pvp.id },
      data: { deletedAt: now, updatedById: actor.userId },
    });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: 'PvpForum',
      entityId: pvp.id,
      before: toPvpDto(pvp, 0),
    });
  });
}

export async function addPvpApproval(workId: string, input: PvpApprovalPayload, actor: Actor) {
  return withWorkDocument(workId, actor, `approval ${input.directorName} dicatat`, async (tx) => {
    const pvp = await findLivePvp(tx, workId);
    const approval = await tx.pvpApproval.create({
      data: {
        pvpForumId: pvp.id,
        directorName: input.directorName,
        decision: input.decision,
        approvalDate: toDate(input.approvalDate),
        notes: input.notes,
        ...stamps(actor),
      },
      select: approvalSelect,
    });
    const dto = toApprovalDto(approval);
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: 'PvpApproval',
      entityId: approval.id,
      after: dto,
    });
    return dto;
  });
}

async function findApproval(tx: TxClient, workId: string, id: string) {
  const approval = await tx.pvpApproval.findFirst({
    where: { id, ...live, pvpForum: { workId, ...live } },
    select: { ...approvalSelect, pvpForum: { select: { id: true, status: true } } },
  });
  if (!approval) throw AppError.notFound('Approval direktur tidak ditemukan');
  return approval;
}

/** An APPROVED PVP must keep enough approvals; change its status first. */
async function assertApprovalRemovable(
  tx: TxClient,
  approval: Awaited<ReturnType<typeof findApproval>>,
) {
  if (approval.pvpForum.status === 'APPROVED' && approval.decision === 'APPROVED') {
    await assertEnoughApprovals(tx, approval.pvpForum.id, -1);
  }
}

export async function updatePvpApproval(
  workId: string,
  id: string,
  input: PvpApprovalPayload,
  actor: Actor,
) {
  return withWorkDocument(
    workId,
    actor,
    `approval ${input.directorName} diperbarui`,
    async (tx) => {
      const before = await findApproval(tx, workId, id);
      if (input.decision !== 'APPROVED') await assertApprovalRemovable(tx, before);
      const approval = await tx.pvpApproval.update({
        where: { id },
        data: {
          directorName: input.directorName,
          decision: input.decision,
          approvalDate: toDate(input.approvalDate),
          notes: input.notes,
          updatedById: actor.userId,
        },
        select: approvalSelect,
      });
      const dto = toApprovalDto(approval);
      await writeAuditLog(tx, {
        actor,
        action: 'UPDATE',
        entity: 'PvpApproval',
        entityId: id,
        before: toApprovalDto(before),
        after: dto,
      });
      return dto;
    },
  );
}

export async function deletePvpApproval(workId: string, id: string, actor: Actor) {
  await withWorkDocument(workId, actor, 'approval direktur dihapus', async (tx) => {
    const before = await findApproval(tx, workId, id);
    await assertApprovalRemovable(tx, before);
    await tx.pvpApproval.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: actor.userId },
    });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: 'PvpApproval',
      entityId: id,
      before: toApprovalDto(before),
    });
  });
}

// ─── Purchase orders & term of payment ───────────────────────────────────────

const termSelect = {
  id: true,
  sequence: true,
  description: true,
  percentage: true,
  amount: true,
  dueDate: true,
  isPaid: true,
} satisfies Prisma.PoPaymentTermSelect;

const poSelect = {
  id: true,
  poNo: true,
  poType: true,
  poName: true,
  poDate: true,
  amount: true,
  currency: true,
  exchangeRate: true,
  amountIdr: true,
  requesterName: true,
  previousPoNo: true,
  previousPoAmount: true,
  previousPoCurrency: true,
  paymentTerms: { where: live, select: termSelect, orderBy: { sequence: 'asc' } },
  agreement: { select: { id: true, agreementNo: true, deletedAt: true } },
} satisfies Prisma.PurchaseOrderSelect;

type PoRecord = Prisma.PurchaseOrderGetPayload<{ select: typeof poSelect }>;

function toTermDto(t: PoRecord['paymentTerms'][number]): PaymentTermDto {
  return {
    ...t,
    percentage: numOrNull(t.percentage),
    amount: num(t.amount),
    dueDate: t.dueDate && day(t.dueDate),
  };
}

function toPoDto(p: PoRecord): PurchaseOrderDto {
  const { agreement, paymentTerms, ...rest } = p;
  return {
    ...rest,
    poDate: day(p.poDate),
    amount: num(p.amount),
    exchangeRate: num(p.exchangeRate),
    amountIdr: num(p.amountIdr),
    previousPoAmount: numOrNull(p.previousPoAmount),
    paymentTerms: paymentTerms.map(toTermDto),
    agreement:
      agreement && !agreement.deletedAt
        ? { id: agreement.id, agreementNo: agreement.agreementNo }
        : null,
  };
}

async function poData(tx: TxClient, input: PoPayload, currentId?: string) {
  if (
    await tx.purchaseOrder.findFirst({
      where: { poNo: input.poNo, ...(currentId && { NOT: { id: currentId } }) },
    })
  ) {
    throw duplicateNumber('No. PO', input.poNo);
  }
  // Link the renewal source when it is already recorded in SIPITA.
  const previous = input.previousPoNo
    ? await tx.purchaseOrder.findFirst({
        where: { poNo: input.previousPoNo, ...live },
        select: { id: true },
      })
    : null;
  return {
    poNo: input.poNo,
    poType: input.poType,
    poName: input.poName,
    poDate: toDate(input.poDate),
    ...money(input),
    requesterName: input.requesterName,
    previousPoId: previous?.id ?? null,
    previousPoNo: input.previousPoNo,
    previousPoAmount: input.previousPoAmount,
    previousPoCurrency: input.previousPoNo ? (input.previousPoCurrency ?? input.currency) : null,
  };
}

export async function createPo(workId: string, input: PoPayload, actor: Actor) {
  return withWorkDocument(workId, actor, `PO ${input.poNo} dicatat`, async (tx, work) => {
    assertHasMilestone(work, 'PO', 'PO');
    const po = await tx.purchaseOrder.create({
      data: { workId, ...(await poData(tx, input)), ...stamps(actor) },
      select: poSelect,
    });
    const dto = toPoDto(po);
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: 'PurchaseOrder',
      entityId: po.id,
      after: dto,
    });
    return dto;
  });
}

async function findPo(tx: TxClient, workId: string, id: string) {
  const po = await tx.purchaseOrder.findFirst({ where: { id, workId, ...live }, select: poSelect });
  if (!po) throw AppError.notFound('PO tidak ditemukan');
  return po;
}

export async function updatePo(workId: string, id: string, input: PoPayload, actor: Actor) {
  return withWorkDocument(workId, actor, `PO ${input.poNo} diperbarui`, async (tx) => {
    const before = await findPo(tx, workId, id);
    const po = await tx.purchaseOrder.update({
      where: { id },
      data: { ...(await poData(tx, input, id)), updatedById: actor.userId },
      select: poSelect,
    });
    const dto = toPoDto(po);
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: 'PurchaseOrder',
      entityId: id,
      before: toPoDto(before),
      after: dto,
    });
    return dto;
  });
}

export async function deletePo(workId: string, id: string, actor: Actor) {
  await withWorkDocument(workId, actor, 'PO dihapus', async (tx) => {
    const before = await findPo(tx, workId, id);
    if (before.agreement && !before.agreement.deletedAt) {
      throw AppError.conflict(
        `PO ini dipakai Agreement ${before.agreement.agreementNo}; hapus agreement-nya dulu`,
      );
    }
    const now = new Date();
    await tx.poPaymentTerm.updateMany({ where: { poId: id, ...live }, data: { deletedAt: now } });
    await tx.purchaseOrder.update({
      where: { id },
      data: { deletedAt: now, updatedById: actor.userId },
    });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: 'PurchaseOrder',
      entityId: id,
      before: toPoDto(before),
    });
  });
}

/** Amount from the percentage of the PO value when only the percentage is given. */
function termAmount(input: PaymentTermPayload, po: PoRecord): number {
  if (input.amount !== null) return input.amount;
  return Math.round(num(po.amount) * input.percentage!) / 100;
}

async function assertSequenceFree(
  tx: TxClient,
  poId: string,
  sequence: number,
  currentId?: string,
) {
  const same = await tx.poPaymentTerm.findFirst({
    where: { poId, sequence, ...(currentId && { NOT: { id: currentId } }) },
  });
  if (same) throw AppError.conflict(`Termin ke-${sequence} sudah ada pada PO ini`);
}

export async function addPaymentTerm(
  workId: string,
  poId: string,
  input: PaymentTermPayload,
  actor: Actor,
) {
  return withWorkDocument(workId, actor, 'termin pembayaran dicatat', async (tx) => {
    const po = await findPo(tx, workId, poId);
    await assertSequenceFree(tx, poId, input.sequence);
    const term = await tx.poPaymentTerm.create({
      data: {
        poId,
        sequence: input.sequence,
        description: input.description,
        percentage: input.percentage,
        amount: termAmount(input, po),
        dueDate: input.dueDate ? toDate(input.dueDate) : null,
        isPaid: input.isPaid,
        ...stamps(actor),
      },
      select: termSelect,
    });
    const dto = toTermDto(term);
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: 'PoPaymentTerm',
      entityId: term.id,
      after: dto,
    });
    return dto;
  });
}

async function findTerm(tx: TxClient, poId: string, id: string) {
  const term = await tx.poPaymentTerm.findFirst({
    where: { id, poId, ...live },
    select: termSelect,
  });
  if (!term) throw AppError.notFound('Termin tidak ditemukan');
  return term;
}

export async function updatePaymentTerm(
  workId: string,
  poId: string,
  id: string,
  input: PaymentTermPayload,
  actor: Actor,
) {
  return withWorkDocument(workId, actor, 'termin pembayaran diperbarui', async (tx) => {
    const po = await findPo(tx, workId, poId);
    const before = await findTerm(tx, poId, id);
    await assertSequenceFree(tx, poId, input.sequence, id);
    const term = await tx.poPaymentTerm.update({
      where: { id },
      data: {
        sequence: input.sequence,
        description: input.description,
        percentage: input.percentage,
        amount: termAmount(input, po),
        dueDate: input.dueDate ? toDate(input.dueDate) : null,
        isPaid: input.isPaid,
        updatedById: actor.userId,
      },
      select: termSelect,
    });
    const dto = toTermDto(term);
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: 'PoPaymentTerm',
      entityId: id,
      before: toTermDto(before),
      after: dto,
    });
    return dto;
  });
}

export async function deletePaymentTerm(workId: string, poId: string, id: string, actor: Actor) {
  await withWorkDocument(workId, actor, 'termin pembayaran dihapus', async (tx) => {
    await findPo(tx, workId, poId);
    const before = await findTerm(tx, poId, id);
    // Hard delete keeps (poId, sequence) free for a corrected entry; the audit log has the row.
    await tx.poPaymentTerm.delete({ where: { id } });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: 'PoPaymentTerm',
      entityId: id,
      before: toTermDto(before),
    });
  });
}

// ─── All documents of a work ─────────────────────────────────────────────────

export async function getDocuments(workId: string, actor: Actor): Promise<WorkDocumentsDto> {
  const [, settings] = await Promise.all([findWork(prisma, workId), getSettings()]);
  const today = dayjs().tz().format('YYYY-MM-DD');
  const [memos, rfq, pvp, pos, agreements, addendums] = await Promise.all([
    prisma.memo.findMany({
      where: { workId, ...live },
      select: memoSelect,
      orderBy: { memoDate: 'asc' },
    }),
    prisma.rfq.findFirst({ where: { workId, ...live }, select: rfqSelect }),
    prisma.pvpForum.findFirst({ where: { workId, ...live }, select: pvpSelect }),
    prisma.purchaseOrder.findMany({
      where: { workId, ...live },
      select: poSelect,
      orderBy: { poDate: 'asc' },
    }),
    prisma.agreement.findMany({
      where: { workId, ...live },
      select: agreementSelect,
      orderBy: { periodStart: 'asc' },
    }),
    prisma.addendum.findMany({
      where: { workId, ...live },
      select: { ...addendumSelect, agreement: { select: { id: true, agreementNo: true } } },
      orderBy: { addendumDate: 'asc' },
    }),
  ]);
  return {
    memos: memos.map(toMemoDto),
    rfq: rfq && toRfqDto(rfq),
    pvp: pvp && toPvpDto(pvp, settings.PVP_MIN_DIRECTOR_APPROVALS),
    purchaseOrders: pos.map(toPoDto),
    agreements: agreements.map((a) => toAgreementDto(a, today, actor)),
    addendums: addendums.map((a) => ({ ...toAddendumDto(a), agreement: a.agreement })),
  };
}
