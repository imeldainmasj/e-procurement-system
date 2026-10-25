import type { AuditAction, SettingsDto } from '@sipita/shared';
import { writeAuditLog } from '../../lib/audit.js';
import { dayjs } from '../../lib/dayjs.js';
import type { TxClient } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { amountInIdr, num } from '../../utils/money.js';
import { nextWorkCode } from '../../utils/numbering.js';
import {
  agreementStatus,
  computeIncreasePercent,
  isPvpRequired,
} from '../../utils/procurementRules.js';
import { refreshAgreementStatus } from '../agreements/agreements.service.js';
import { activeFor } from '../milestone-templates/milestone-templates.service.js';
import { refreshWorkIssues, syncMilestones } from '../works/work-state.js';
import { milestonesFromTemplate } from '../works/works.service.js';
import type { Plan, WorkRef } from './import.plan.js';

/**
 * Writes a validated plan (CLAUDE.md §7). Runs inside one transaction; every created or
 * updated row gets an AuditLog with source IMPORT and the batch id — for updates `before`
 * is the full database row, which is what a rollback restores.
 */

export type CommitSummary = Record<string, { created: number; updated: number }>;

const live = { deletedAt: null };
const day = (s: string) => new Date(s);
const dayOrNull = (s: string | null) => (s ? new Date(s) : null);

export async function applyPlan(
  tx: TxClient,
  plan: Plan,
  ctx: { batchId: string; fileName: string; actor: Actor; settings: SettingsDto },
  onProgress: (done: number) => void,
): Promise<CommitSummary> {
  const { batchId, actor, settings } = ctx;
  const summary: CommitSummary = {};
  let done = 0;
  const step = () => onProgress(++done);
  const stamps = { createdById: actor.userId, updatedById: actor.userId, importBatchId: batchId };

  async function audit(
    entity: string,
    id: string,
    action: AuditAction,
    before: unknown,
    after: unknown,
  ) {
    const s = (summary[entity] ??= { created: 0, updated: 0 });
    if (action === 'CREATE') s.created++;
    else s.updated++;
    await writeAuditLog(tx, {
      actor,
      action,
      entity,
      entityId: id,
      before,
      after,
      source: 'IMPORT',
      importBatchId: batchId,
    });
  }
  /** Updates keep the batch that created the row; a revived (soft-deleted) row is restored. */
  const updateStamps = { updatedById: actor.userId, deletedAt: null };

  // ── Vendors ──
  const vendorId = new Map<string, string>();
  for (const v of plan.vendors) {
    if (v.existingId) {
      const before = await tx.vendor.findUniqueOrThrow({ where: { id: v.existingId } });
      const after = await tx.vendor.update({
        where: { id: v.existingId },
        data: { ...v.data, ...updateStamps },
      });
      await audit('Vendor', after.id, 'UPDATE', before, after);
      vendorId.set(v.data.code, after.id);
    } else {
      const created = await tx.vendor.create({ data: { ...v.data, ...stamps } });
      await audit('Vendor', created.id, 'CREATE', undefined, created);
      vendorId.set(v.data.code, created.id);
    }
    step();
  }
  const vendorFor = async (code: string) => {
    if (!vendorId.has(code)) {
      const v = await tx.vendor.findFirst({ where: { code, ...live }, select: { id: true } });
      if (v) vendorId.set(code, v.id);
    }
    return vendorId.get(code) ?? null;
  };

  // ── Works ──
  const workId = new Map<string, string>();
  const idOf = (ref: WorkRef) => workId.get(ref.key) ?? ref.existingId!;
  for (const w of plan.works) {
    const d = w.data;
    const amountIdr = amountInIdr(d.amount, d.exchangeRate);
    const increasePercent = computeIncreasePercent(num(amountIdr), d.previousPurchaseAmount);
    const pvpRequired = isPvpRequired(num(amountIdr), increasePercent, settings);
    const data = {
      title: d.title,
      procurementType: d.procurementType,
      category: d.category,
      method: d.method,
      procurementYear: d.procurementYear,
      picId: d.picId,
      requesterDirectorateId: d.requesterDirectorateId,
      vendorId: d.vendorCode ? await vendorFor(d.vendorCode) : null,
      amount: d.amount,
      currency: d.currency,
      exchangeRate: d.exchangeRate,
      amountIdr,
      previousPurchaseAmount: d.previousPurchaseAmount,
      increasePercent,
      pvpRequired,
      periodStart: dayOrNull(d.periodStart),
      periodEnd: dayOrNull(d.periodEnd),
      pkResult: d.pkResult,
      status: d.status,
      notes: d.notes,
      lastUpdatedAt: new Date(),
    };
    if (w.ref.existingId) {
      const before = await tx.work.findUniqueOrThrow({ where: { id: w.ref.existingId } });
      const after = await tx.work.update({
        where: { id: w.ref.existingId },
        data: { ...data, ...updateStamps },
      });
      // An untouched conditional PVP follows the (possibly changed) PVP requirement.
      await tx.workMilestone.updateMany({
        where: {
          workId: after.id,
          isConditional: true,
          status: { in: ['NOT_STARTED', 'NOT_APPLICABLE'] },
        },
        data: { status: pvpRequired ? 'NOT_STARTED' : 'NOT_APPLICABLE' },
      });
      await audit('Work', after.id, 'UPDATE', before, after);
      workId.set(w.ref.key, after.id);
    } else {
      const templates = await activeFor(tx, d.method);
      const created = await tx.work.create({
        data: {
          ...data,
          ...stamps,
          code: await nextWorkCode(tx, d.procurementYear),
          milestones: { create: milestonesFromTemplate(templates, pvpRequired) },
        },
      });
      await audit('Work', created.id, 'CREATE', undefined, created);
      workId.set(w.ref.key, created.id);
    }
    step();
  }

  /** Create-or-update one document row with its audit entry. */
  async function upsert<T extends { id: string }>(
    entity: string,
    existingId: string | null,
    find: (id: string) => Promise<T>,
    update: (id: string) => Promise<T>,
    create: () => Promise<T>,
  ): Promise<T> {
    if (existingId) {
      const before = await find(existingId);
      const after = await update(existingId);
      await audit(entity, after.id, 'UPDATE', before, after);
      return after;
    }
    const created = await create();
    await audit(entity, created.id, 'CREATE', undefined, created);
    return created;
  }

  // ── Memo & MoA ──
  for (const m of plan.memos) {
    const d = m.data;
    const money = d.money
      ? { ...d.money, amountIdr: amountInIdr(d.money.amount, d.money.exchangeRate) }
      : { amount: null, currency: null, exchangeRate: null, amountIdr: null };
    const data = {
      workId: idOf(m.work),
      memoNo: d.memoNo,
      memoType: d.memoType,
      title: d.title,
      memoDate: day(d.memoDate),
      requesterName: d.requesterName,
      notes: d.notes,
      ...money,
    };
    await upsert(
      'Memo',
      m.existingId,
      (id) => tx.memo.findUniqueOrThrow({ where: { id } }),
      (id) => tx.memo.update({ where: { id }, data: { ...data, ...updateStamps } }),
      () => tx.memo.create({ data: { ...data, ...stamps } }),
    );
    step();
  }

  // ── RFQ & LoA ──
  for (const r of plan.rfqs) {
    const d = r.data;
    const data = {
      workId: idOf(r.work),
      rfqNo: d.rfqNo,
      method: d.method,
      periodStart: day(d.periodStart),
      periodEnd: day(d.periodEnd),
      amount: d.amount,
      currency: d.currency,
      exchangeRate: d.exchangeRate,
      amountIdr: amountInIdr(d.amount, d.exchangeRate),
      termOfPayment: d.termOfPayment,
      loaNo: d.loaNo,
      loaDate: dayOrNull(d.loaDate),
      loaProcessedBy: d.loaProcessedBy,
    };
    await upsert(
      'Rfq',
      r.existingId,
      (id) => tx.rfq.findUniqueOrThrow({ where: { id } }),
      (id) => tx.rfq.update({ where: { id }, data: { ...data, ...updateStamps } }),
      () => tx.rfq.create({ data: { ...data, ...stamps } }),
    );
    step();
  }

  // ── PVP + approvals ──
  const forumId = new Map<string, string>();
  for (const p of plan.pvps) {
    const data = {
      workId: idOf(p.work),
      pvpDate: day(p.data.pvpDate),
      status: p.data.status,
      notes: p.data.notes,
    };
    const forum = await upsert(
      'PvpForum',
      p.existingId,
      (id) => tx.pvpForum.findUniqueOrThrow({ where: { id } }),
      (id) => tx.pvpForum.update({ where: { id }, data: { ...data, ...updateStamps } }),
      () => tx.pvpForum.create({ data: { ...data, ...stamps } }),
    );
    forumId.set(p.work.key, forum.id);
    step();
  }
  for (const a of plan.approvals) {
    let pvpForumId = forumId.get(a.work.key);
    if (!pvpForumId) {
      const forum = await tx.pvpForum.findFirstOrThrow({ where: { workId: idOf(a.work) } });
      pvpForumId = forum.id;
    }
    const data = {
      pvpForumId,
      directorName: a.data.directorName,
      decision: a.data.decision,
      approvalDate: day(a.data.approvalDate),
      notes: a.data.notes,
    };
    await upsert(
      'PvpApproval',
      a.existingId,
      (id) => tx.pvpApproval.findUniqueOrThrow({ where: { id } }),
      (id) => tx.pvpApproval.update({ where: { id }, data: { ...data, ...updateStamps } }),
      () => tx.pvpApproval.create({ data: { ...data, ...stamps } }),
    );
    step();
  }

  // ── Official approval (milestone) ──
  for (const o of plan.officials) {
    const milestone = await tx.workMilestone.findUniqueOrThrow({
      where: { workId_type: { workId: idOf(o.work), type: 'OFFICIAL_APPROVAL' } },
    });
    const date = dayOrNull(o.data.approvalDate);
    const after = await tx.workMilestone.update({
      where: { id: milestone.id },
      data: {
        status: date ? 'DONE' : 'IN_PROGRESS',
        startedAt: milestone.startedAt ?? date ?? new Date(),
        completedAt: date,
        referenceNo: o.data.referenceNo,
        notes: o.data.notes,
        updatedById: actor.userId,
      },
    });
    await audit('WorkMilestone', after.id, 'UPDATE', milestone, after);
    step();
  }

  // ── PO + term of payment ──
  const poByNo = new Map<string, { id: string; amount: number }>();
  for (const p of plan.pos) {
    const d = p.data;
    const previous = d.previousPoNo
      ? await tx.purchaseOrder.findFirst({
          where: { poNo: d.previousPoNo, ...live },
          select: { id: true },
        })
      : null;
    const data = {
      workId: idOf(p.work),
      poNo: d.poNo,
      poType: d.poType,
      poName: d.poName,
      poDate: day(d.poDate),
      amount: d.amount,
      currency: d.currency,
      exchangeRate: d.exchangeRate,
      amountIdr: amountInIdr(d.amount, d.exchangeRate),
      requesterName: d.requesterName,
      previousPoId: previous?.id ?? null,
      previousPoNo: d.previousPoNo,
      previousPoAmount: d.previousPoAmount,
      previousPoCurrency: d.previousPoNo ? (d.previousPoCurrency ?? d.currency) : null,
    };
    const po = await upsert(
      'PurchaseOrder',
      p.existingId,
      (id) => tx.purchaseOrder.findUniqueOrThrow({ where: { id } }),
      (id) => tx.purchaseOrder.update({ where: { id }, data: { ...data, ...updateStamps } }),
      () => tx.purchaseOrder.create({ data: { ...data, ...stamps } }),
    );
    poByNo.set(d.poNo.toLowerCase(), { id: po.id, amount: d.amount });
    step();
  }
  const poFor = async (poNo: string) => {
    const key = poNo.toLowerCase();
    if (!poByNo.has(key)) {
      const po = await tx.purchaseOrder.findFirstOrThrow({
        where: { poNo, ...live },
        select: { id: true, amount: true },
      });
      poByNo.set(key, { id: po.id, amount: num(po.amount) });
    }
    return poByNo.get(key)!;
  };
  for (const t of plan.terms) {
    const po = await poFor(t.poNo);
    const data = {
      poId: po.id,
      sequence: t.data.sequence,
      description: t.data.description,
      percentage: t.data.percentage,
      // "Nilai Termin (otomatis)" in the template: percentage × PO value.
      amount: Math.round(po.amount * t.data.percentage) / 100,
      dueDate: dayOrNull(t.data.dueDate),
      isPaid: t.data.isPaid,
    };
    await upsert(
      'PoPaymentTerm',
      t.existingId,
      (id) => tx.poPaymentTerm.findUniqueOrThrow({ where: { id } }),
      (id) => tx.poPaymentTerm.update({ where: { id }, data: { ...data, ...updateStamps } }),
      () => tx.poPaymentTerm.create({ data: { ...data, ...stamps } }),
    );
    step();
  }

  // ── Agreements, then PK source links, then addendums ──
  const today = dayjs().tz().format('YYYY-MM-DD');
  const agreementIds = new Set<string>();
  for (const a of plan.agreements) {
    const d = a.data;
    const data = {
      workId: idOf(a.work),
      agreementNo: d.agreementNo,
      agreementType: d.agreementType,
      title: d.title,
      vendorId: (await vendorFor(d.vendorCode))!,
      poId: (await poFor(d.poNo)).id,
      picId: d.picId,
      periodStart: day(d.periodStart),
      periodEnd: day(d.periodEnd),
      amount: d.amount,
      currency: d.currency,
      exchangeRate: d.exchangeRate,
      amountIdr: amountInIdr(d.amount, d.exchangeRate),
      status: agreementStatus(d.periodEnd, today, settings.CONTRACT_REMINDER_DAYS),
    };
    const agreement = await upsert(
      'Agreement',
      a.existingId,
      (id) => tx.agreement.findUniqueOrThrow({ where: { id } }),
      (id) => tx.agreement.update({ where: { id }, data: { ...data, ...updateStamps } }),
      () => tx.agreement.create({ data: { ...data, ...stamps } }),
    );
    agreementIds.add(agreement.id);
    step();
  }
  const agreementFor = (agreementNo: string) =>
    tx.agreement.findFirst({
      where: { agreementNo, ...live },
      select: { id: true, currency: true, exchangeRate: true },
    });
  for (const w of plan.works) {
    if (!w.data.sourceAgreementNo) continue;
    const source = await agreementFor(w.data.sourceAgreementNo);
    await tx.work.update({
      where: { id: idOf(w.ref) },
      data: { sourceAgreementId: source?.id ?? null },
    });
  }
  for (const a of plan.addendums) {
    const d = a.data;
    const agreement = (await agreementFor(d.agreementNo))!;
    // The template has no rate column: use the agreement's rate for its own currency.
    const rate =
      d.currency === 'IDR'
        ? 1
        : d.currency === agreement.currency
          ? num(agreement.exchangeRate)
          : 1;
    const data = {
      agreementId: agreement.id,
      workId: idOf(a.work),
      addendumNo: d.addendumNo,
      title: d.title,
      addendumDate: day(d.addendumDate),
      newPeriodEnd: dayOrNull(d.newPeriodEnd),
      valueChange: d.valueChange,
      currency: d.currency,
      exchangeRate: d.valueChange === null ? null : rate,
      valueChangeIdr: d.valueChange === null ? null : amountInIdr(d.valueChange, rate),
      poId: d.poNo ? (await poFor(d.poNo)).id : null,
      notes: d.notes,
    };
    await upsert(
      'Addendum',
      a.existingId,
      (id) => tx.addendum.findUniqueOrThrow({ where: { id } }),
      (id) => tx.addendum.update({ where: { id }, data: { ...data, ...updateStamps } }),
      () => tx.addendum.create({ data: { ...data, ...stamps } }),
    );
    agreementIds.add(agreement.id);
    step();
  }

  // ── Milestones follow the documents as they are (no blocking, §7) ──
  const touched = new Set<string>(workId.values());
  for (const list of [
    plan.memos,
    plan.rfqs,
    plan.pvps,
    plan.approvals,
    plan.officials,
    plan.pos,
    plan.agreements,
    plan.addendums,
  ]) {
    for (const d of list) touched.add(idOf(d.work));
  }
  for (const id of touched) {
    await syncMilestones(tx, id, settings, {
      authorId: actor.userId,
      reason: `dokumen dari import ${ctx.fileName}`,
      strict: false,
    });
    await tx.workUpdate.create({
      data: { workId: id, authorId: actor.userId, note: `Data diimport dari ${ctx.fileName}` },
    });
    await tx.work.update({ where: { id }, data: { lastUpdatedAt: new Date() } });
    await refreshWorkIssues(tx, id, settings);
  }
  for (const id of agreementIds)
    await refreshAgreementStatus(tx, id, settings.CONTRACT_REMINDER_DAYS);
  return summary;
}

/** Number of steps reported by applyPlan (for the progress bar). */
export function planSize(plan: Plan): number {
  return (
    plan.vendors.length +
    plan.works.length +
    plan.memos.length +
    plan.rfqs.length +
    plan.pvps.length +
    plan.approvals.length +
    plan.officials.length +
    plan.pos.length +
    plan.terms.length +
    plan.agreements.length +
    plan.addendums.length
  );
}
