import {
  canCancelPr,
  canCompleteStockCheck,
  canCreatePr,
  canEditPr,
  canStartStockCheck,
  canViewAllPrs,
  canViewPr,
  PR_STATUS_LABELS,
  PR_TRANSITIONS,
  type ApprovalStepDto,
  type PrActor,
  type PrDto,
  type PrHistoryEntryDto,
  type PrListItemDto,
  type PrPayload,
  type PrStatus,
  type PrStockCheckInput,
  type prListQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { dayjs } from '../../lib/dayjs.js';
import { type Email, sendMailInBackground } from '../../lib/mailer.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { DOCUMENT_PREFIX, nextDocumentNumber } from '../../utils/numbering.js';
import { buildOrderBy, pageArgs, pageMeta, searchFilter } from '../../utils/pagination.js';
import { assertTransition } from '../../utils/stateMachine.js';
import { cancelApproval, startApproval } from '../approvals/approval-workflow.js';
import { findUserIdsByRole, notifyUsers } from '../notifications/notifications.service.js';
import { cancelDraftPosForPr } from '../purchase-orders/purchase-orders.service.js';
import { transitionPr } from './pr-status.js';

type ListQuery = z.output<typeof prListQuerySchema>;

const ENTITY = 'PurchaseRequest';

// ─── Selects & mapping ───────────────────────────────────────────────────────

const listSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  neededDate: true,
  estimatedTotal: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
  requester: { select: { id: true, name: true } },
  division: { select: { id: true, code: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.PurchaseRequestSelect;

const detailSelect = {
  ...listSelect,
  justification: true,
  stockCheckedAt: true,
  stockCheckNotes: true,
  stockCheckedBy: { select: { id: true, name: true } },
  cancelReason: true,
  cancelledAt: true,
  _count: { select: { items: true, quotations: true } },
  purchaseOrders: {
    where: { status: { not: 'CANCELLED' } },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      expectedDate: true,
      vendor: { select: { name: true } },
    },
  },
  items: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      itemId: true,
      freeTextName: true,
      unit: true,
      qty: true,
      estimatedUnitPrice: true,
      subtotal: true,
      notes: true,
      item: { select: { id: true, code: true, name: true, isAsset: true } },
    },
  },
  memo: {
    select: {
      id: true,
      number: true,
      status: true,
      steps: {
        orderBy: { sequence: 'asc' },
        select: {
          id: true,
          level: true,
          sequence: true,
          status: true,
          comment: true,
          actedAt: true,
          pendingSince: true,
          approver: { select: { id: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.PurchaseRequestSelect;

type ListRecord = Prisma.PurchaseRequestGetPayload<{ select: typeof listSelect }>;
type DetailRecord = Prisma.PurchaseRequestGetPayload<{ select: typeof detailSelect }>;

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

type StepRecord = NonNullable<DetailRecord['memo']>['steps'][number];

export function toStepDto(step: StepRecord): ApprovalStepDto {
  return {
    id: step.id,
    level: step.level,
    sequence: step.sequence,
    status: step.status,
    approver: step.approver,
    comment: step.comment,
    actedAt: iso(step.actedAt),
    pendingSince: iso(step.pendingSince),
  };
}

function toListDto(pr: ListRecord): PrListItemDto {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    status: pr.status,
    priority: pr.priority,
    neededDate: dateOnly(pr.neededDate),
    estimatedTotal: pr.estimatedTotal.toFixed(2),
    itemCount: pr._count.items,
    requester: pr.requester,
    division: pr.division,
    submittedAt: iso(pr.submittedAt),
    createdAt: iso(pr.createdAt),
    updatedAt: iso(pr.updatedAt),
  };
}

function toDto(pr: DetailRecord): PrDto {
  const po = pr.purchaseOrders[0];
  return {
    ...toListDto(pr),
    justification: pr.justification,
    items: pr.items.map((i) => ({
      id: i.id,
      itemId: i.itemId,
      item: i.item,
      freeTextName: i.freeTextName,
      name: i.item?.name ?? i.freeTextName ?? '',
      unit: i.unit,
      qty: i.qty,
      estimatedUnitPrice: i.estimatedUnitPrice.toFixed(2),
      subtotal: i.subtotal.toFixed(2),
      notes: i.notes,
    })),
    stockCheck: pr.stockCheckedAt
      ? { by: pr.stockCheckedBy, at: iso(pr.stockCheckedAt), notes: pr.stockCheckNotes }
      : null,
    cancellation:
      pr.cancelReason && pr.cancelledAt
        ? { reason: pr.cancelReason, at: iso(pr.cancelledAt) }
        : null,
    memo: pr.memo
      ? {
          id: pr.memo.id,
          number: pr.memo.number,
          status: pr.memo.status,
          steps: pr.memo.steps.map(toStepDto),
        }
      : null,
    quotationCount: pr._count.quotations,
    purchaseOrder: po
      ? {
          id: po.id,
          number: po.number,
          status: po.status,
          vendorName: po.vendor.name,
          total: po.total.toFixed(2),
          expectedDate: po.expectedDate ? dateOnly(po.expectedDate) : null,
        }
      : null,
  };
}

const toPrActor = (actor: Actor): PrActor => ({ id: actor.userId, roles: actor.roles });

// ─── Queries ─────────────────────────────────────────────────────────────────

/** Requesters see only their own PRs; other roles see every non-draft PR plus their own drafts. */
export function visibilityFilter(actor: Actor, mine?: boolean): Prisma.PurchaseRequestWhereInput {
  if (mine || !canViewAllPrs(toPrActor(actor))) return { requesterId: actor.userId };
  return { OR: [{ requesterId: actor.userId }, { status: { not: 'DRAFT' } }] };
}

export async function list(q: ListQuery, actor: Actor) {
  const where: Prisma.PurchaseRequestWhereInput = {
    AND: [
      visibilityFilter(actor, q.mine),
      searchFilter(q.search, ['number', 'title']),
      {
        ...(q.status && { status: q.status }),
        ...(q.priority && { priority: q.priority }),
        ...(q.divisionId && { divisionId: q.divisionId }),
        ...((q.dateFrom || q.dateTo) && {
          createdAt: {
            ...(q.dateFrom && { gte: dayjs.tz(q.dateFrom).startOf('day').toDate() }),
            ...(q.dateTo && { lte: dayjs.tz(q.dateTo).endOf('day').toDate() }),
          },
        }),
      },
    ],
  };

  const [rows, total] = await prisma.$transaction([
    prisma.purchaseRequest.findMany({
      where,
      select: listSelect,
      orderBy: buildOrderBy<Prisma.PurchaseRequestOrderByWithRelationInput>(
        q.sort,
        [
          'number',
          'title',
          'status',
          'priority',
          'neededDate',
          'estimatedTotal',
          'submittedAt',
          'createdAt',
          'requester.name',
          'division.name',
        ],
        { createdAt: 'desc' },
      ),
      ...pageArgs(q),
    }),
    prisma.purchaseRequest.count({ where }),
  ]);
  return { data: rows.map(toListDto), meta: pageMeta(q, total) };
}

/** Loads a PR the actor may see; invisible PRs are reported as not found. */
async function findVisible(id: string, actor: Actor, db: TxClient = prisma): Promise<DetailRecord> {
  const pr = await db.purchaseRequest.findUnique({ where: { id }, select: detailSelect });
  if (!pr || !canViewPr({ requesterId: pr.requester.id, status: pr.status }, toPrActor(actor))) {
    throw AppError.notFound('Pengajuan tidak ditemukan');
  }
  return pr;
}

export async function get(id: string, actor: Actor): Promise<PrDto> {
  return toDto(await findVisible(id, actor));
}

export async function history(id: string, actor: Actor): Promise<PrHistoryEntryDto[]> {
  await findVisible(id, actor);
  const logs = await prisma.auditLog.findMany({
    where: { entity: ENTITY, entityId: id, action: { in: ['CREATE', 'STATUS_CHANGE'] } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      action: true,
      before: true,
      after: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
  });
  const field = (json: Prisma.JsonValue, key: string): string | null => {
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      const value = json[key];
      return typeof value === 'string' ? value : null;
    }
    return null;
  };
  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    fromStatus: field(log.before, 'status') as PrStatus | null,
    toStatus:
      (field(log.after, 'status') as PrStatus | null) ?? (log.action === 'CREATE' ? 'DRAFT' : null),
    note: field(log.after, 'note'),
    user: log.user,
    at: iso(log.createdAt),
  }));
}

// ─── Draft editing ───────────────────────────────────────────────────────────

const todayInJakarta = () => dayjs().tz().format('YYYY-MM-DD');

function assertNeededDate(neededDate: string): void {
  if (neededDate < todayInJakarta()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Tanggal dibutuhkan tidak boleh di masa lalu', [
      { path: 'neededDate', message: 'Tanggal dibutuhkan tidak boleh di masa lalu' },
    ]);
  }
}

/** Resolves catalog items (unit comes from the catalog) and computes subtotals and the total. */
async function buildItems(input: PrPayload) {
  const catalogIds = [...new Set(input.items.flatMap((i) => (i.itemId ? [i.itemId] : [])))];
  const catalog = await prisma.item.findMany({
    where: { id: { in: catalogIds }, deletedAt: null },
    select: { id: true, unit: true },
  });
  const units = new Map(catalog.map((c) => [c.id, c.unit]));

  const missing = input.items.flatMap((item, index) =>
    item.itemId && !units.has(item.itemId)
      ? [{ path: `items.${index}.itemId`, message: 'Item katalog tidak ditemukan' }]
      : [],
  );
  if (missing.length > 0) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Sebagian item tidak ditemukan di katalog',
      missing,
    );
  }

  const items = input.items.map((item, index) => {
    const price = new Prisma.Decimal(item.estimatedUnitPrice);
    return {
      itemId: item.itemId,
      freeTextName: item.itemId ? null : item.freeTextName,
      unit: item.itemId ? units.get(item.itemId)! : item.unit!,
      qty: item.qty,
      estimatedUnitPrice: price,
      subtotal: price.mul(item.qty),
      notes: item.notes,
      sortOrder: index,
    };
  });
  const estimatedTotal = items.reduce((sum, i) => sum.add(i.subtotal), new Prisma.Decimal(0));
  return { items, estimatedTotal };
}

export async function create(input: PrPayload, actor: Actor): Promise<PrDto> {
  if (!canCreatePr(toPrActor(actor)))
    throw AppError.forbidden('Anda tidak memiliki akses membuat pengajuan');
  assertNeededDate(input.neededDate);

  const requester = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { divisionId: true },
  });
  if (!requester.divisionId) {
    throw AppError.badRequest('Akun Anda belum terdaftar di divisi mana pun. Hubungi Super Admin.');
  }
  const { items, estimatedTotal } = await buildItems(input);

  const pr = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseRequest.create({
      data: {
        title: input.title,
        justification: input.justification,
        priority: input.priority,
        neededDate: new Date(input.neededDate),
        estimatedTotal,
        requesterId: actor.userId,
        createdById: actor.userId,
        divisionId: requester.divisionId!,
        items: { create: items },
      },
      select: detailSelect,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: ENTITY,
      entityId: created.id,
      after: toDto(created),
    });
    return created;
  });
  return toDto(pr);
}

/** Loads a PR for an owner-only draft action, with precise errors. */
async function findEditable(id: string, actor: Actor): Promise<DetailRecord> {
  const pr = await findVisible(id, actor);
  const ref = { requesterId: pr.requester.id, status: pr.status };
  if (!canEditPr(ref, toPrActor(actor))) {
    if (pr.requester.id !== actor.userId)
      throw AppError.forbidden('Hanya pembuat pengajuan yang dapat mengubahnya');
    throw new AppError(409, 'INVALID_STATUS', 'Hanya pengajuan berstatus Draft yang dapat diubah');
  }
  return pr;
}

export async function update(id: string, input: PrPayload, actor: Actor): Promise<PrDto> {
  const before = await findEditable(id, actor);
  assertNeededDate(input.neededDate);
  const { items, estimatedTotal } = await buildItems(input);

  const pr = await prisma.$transaction(async (tx) => {
    const updated = await tx.purchaseRequest.update({
      where: { id },
      data: {
        title: input.title,
        justification: input.justification,
        priority: input.priority,
        neededDate: new Date(input.neededDate),
        estimatedTotal,
        items: { deleteMany: {}, create: items },
      },
      select: detailSelect,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before: toDto(before),
      after: toDto(updated),
    });
    return updated;
  });
  return toDto(pr);
}

/** Drafts have no document number yet, so they are removed outright. */
export async function remove(id: string, actor: Actor): Promise<void> {
  const pr = await findEditable(id, actor);
  await prisma.$transaction(async (tx) => {
    await tx.purchaseRequest.delete({ where: { id } });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: ENTITY,
      entityId: id,
      before: toDto(pr),
    });
  });
}

// ─── Status changes ──────────────────────────────────────────────────────────

/** Applies a status change (see `transitionPr`) and returns the refreshed PR. */
async function changeStatus(
  tx: TxClient,
  pr: DetailRecord,
  to: PrStatus,
  actor: Actor,
  data: Prisma.PurchaseRequestUncheckedUpdateManyInput = {},
  note: string | null = null,
): Promise<DetailRecord> {
  await transitionPr(tx, pr, to, actor, data, note);
  return tx.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id }, select: detailSelect });
}

export async function submit(id: string, actor: Actor): Promise<PrDto> {
  const pr = await findEditable(id, actor);
  assertNeededDate(dateOnly(pr.neededDate));
  if (pr.items.length === 0)
    throw AppError.badRequest('Pengajuan harus memiliki minimal satu item');

  const updated = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const number = await nextDocumentNumber(tx, DOCUMENT_PREFIX.PURCHASE_REQUEST, now);
    const result = await changeStatus(tx, pr, 'SUBMITTED', actor, { number, submittedAt: now });
    await notifyUsers(tx, await findUserIdsByRole(tx, 'WAREHOUSE'), {
      type: 'PR_STOCK_CHECK_REQUIRED',
      title: `Cek stok: ${number}`,
      message: `Pengajuan "${pr.title}" dari ${pr.requester.name} perlu dicek ketersediaannya di gudang.`,
      link: `/pengajuan/${pr.id}`,
    });
    return result;
  });
  return toDto(updated);
}

export async function startStockCheck(id: string, actor: Actor): Promise<PrDto> {
  const pr = await findVisible(id, actor);
  if (!canStartStockCheck({ requesterId: pr.requester.id, status: pr.status }, toPrActor(actor))) {
    assertTransition(PR_TRANSITIONS, pr.status, 'STOCK_CHECK', PR_STATUS_LABELS);
    throw AppError.forbidden('Hanya Admin Gudang yang dapat melakukan cek stok');
  }
  const updated = await prisma.$transaction((tx) => changeStatus(tx, pr, 'STOCK_CHECK', actor));
  return toDto(updated);
}

/**
 * Records the stock-check outcome for the whole PR (all-or-nothing): available → fulfilled
 * from stock; otherwise the PR continues to approval.
 */
export async function completeStockCheck(
  id: string,
  input: PrStockCheckInput,
  actor: Actor,
): Promise<PrDto> {
  const pr = await findVisible(id, actor);
  const to: PrStatus = input.available ? 'FULFILLED_FROM_STOCK' : 'PENDING_APPROVAL';
  if (
    !canCompleteStockCheck({ requesterId: pr.requester.id, status: pr.status }, toPrActor(actor))
  ) {
    assertTransition(PR_TRANSITIONS, pr.status, to, PR_STATUS_LABELS);
    throw AppError.forbidden('Hanya Admin Gudang yang dapat melakukan cek stok');
  }
  const notes = input.notes ?? null;
  let emails: Email[] = [];
  const updated = await prisma.$transaction(async (tx) => {
    await transitionPr(
      tx,
      pr,
      to,
      actor,
      { stockCheckedById: actor.userId, stockCheckedAt: new Date(), stockCheckNotes: notes },
      notes,
    );
    if (to === 'PENDING_APPROVAL') {
      // Generates the internal memo and opens the first approval step (may approve right away
      // when every level is skipped).
      emails = await startApproval(tx, pr.id, actor);
    } else {
      await notifyUsers(tx, [pr.requester.id], {
        type: 'PR_FULFILLED_FROM_STOCK',
        title: `Tersedia di gudang: ${pr.number}`,
        message: `Pengajuan "${pr.title}" dapat dipenuhi dari stok gudang. Gudang IT akan menghubungi Anda untuk serah terima.`,
        link: `/pengajuan/${pr.id}`,
      });
    }
    return tx.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id }, select: detailSelect });
  });
  sendMailInBackground(emails);
  return toDto(updated);
}

export async function cancel(id: string, reason: string, actor: Actor): Promise<PrDto> {
  const pr = await findVisible(id, actor);
  if (!canCancelPr({ requesterId: pr.requester.id, status: pr.status }, toPrActor(actor))) {
    assertTransition(PR_TRANSITIONS, pr.status, 'CANCELLED', PR_STATUS_LABELS);
    throw AppError.forbidden('Anda tidak dapat membatalkan pengajuan ini');
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (pr.status === 'PENDING_APPROVAL') await cancelApproval(tx, pr.id, actor);
    if (pr.status === 'QUOTATION') await cancelDraftPosForPr(tx, pr.id, reason, actor);
    return changeStatus(
      tx,
      pr,
      'CANCELLED',
      actor,
      { cancelReason: reason, cancelledAt: new Date() },
      reason,
    );
  });
  return toDto(updated);
}
