import {
  formatRupiah,
  PO_RATABLE_STATUSES,
  PO_STATUS_LABELS,
  PO_TRANSITIONS,
  type PoCreatePayload,
  type PoDto,
  type PoListItemDto,
  type PoStatus,
  type PoUpdatePayload,
  type Role,
  type VendorRatingDto,
  type VendorRatingPayload,
  type poListQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { DOCUMENT_PREFIX, nextDocumentNumber } from '../../utils/numbering.js';
import { buildOrderBy, pageArgs, pageMeta } from '../../utils/pagination.js';
import { assertTransition } from '../../utils/stateMachine.js';
import { findUserIdsByRole, notifyUsers } from '../notifications/notifications.service.js';
import { recordPrices, removePrices } from '../price-history/price-history.service.js';
import { transitionPr } from '../purchase-requests/pr-status.js';
import { lockEditablePr } from '../quotations/quotations.service.js';
import { getSettings } from '../settings/settings.service.js';

type ListQuery = z.output<typeof poListQuerySchema>;

const ENTITY = 'PurchaseOrder';

/** Warehouse needs POs to receive goods (stage 8); only PROCUREMENT edits. */
export const PO_READ_ROLES: Role[] = ['PROCUREMENT', 'VIEWER', 'WAREHOUSE'];

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const optionalDate = (d: Date | null) => (d ? dateOnly(d) : null);

/** PPN rounded half-up to cents, matching `computePoTotals` in the shared rules. */
export function computeTotals(subtotal: Prisma.Decimal, taxPercent: number) {
  const taxAmount = subtotal
    .mul(taxPercent)
    .div(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    subtotal,
    taxPercent: new Prisma.Decimal(taxPercent),
    taxAmount,
    total: subtotal.add(taxAmount),
  };
}

// ─── Selects & mapping ───────────────────────────────────────────────────────

const listSelect = {
  id: true,
  number: true,
  status: true,
  orderDate: true,
  expectedDate: true,
  total: true,
  issuedAt: true,
  createdAt: true,
  vendor: { select: { id: true, code: true, name: true } },
  pr: { select: { id: true, number: true, title: true } },
  _count: { select: { items: true } },
} satisfies Prisma.PurchaseOrderSelect;

const ratingSelect = {
  id: true,
  poId: true,
  onTime: true,
  quality: true,
  price: true,
  service: true,
  notes: true,
  createdAt: true,
  ratedBy: { select: { id: true, name: true } },
} satisfies Prisma.VendorRatingSelect;

const detailSelect = {
  ...listSelect,
  prId: true,
  vendorId: true,
  subtotal: true,
  taxPercent: true,
  taxAmount: true,
  terms: true,
  deliveryAddress: true,
  notes: true,
  cancelReason: true,
  cancelledAt: true,
  updatedAt: true,
  vendor: {
    select: {
      id: true,
      code: true,
      name: true,
      npwp: true,
      address: true,
      city: true,
      picName: true,
      phone: true,
      email: true,
    },
  },
  pr: {
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      requester: { select: { id: true, name: true } },
      division: { select: { id: true, name: true } },
    },
  },
  quotation: { select: { id: true, quoteNumber: true, selectionJustification: true } },
  createdBy: { select: { id: true, name: true } },
  issuedBy: { select: { id: true, name: true } },
  rating: { select: ratingSelect },
  items: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      prItemId: true,
      name: true,
      unit: true,
      qty: true,
      receivedQty: true,
      unitPrice: true,
      subtotal: true,
      item: { select: { id: true, code: true } },
    },
  },
} satisfies Prisma.PurchaseOrderSelect;

type ListRecord = Prisma.PurchaseOrderGetPayload<{ select: typeof listSelect }>;
export type PoDetailRecord = Prisma.PurchaseOrderGetPayload<{ select: typeof detailSelect }>;
type RatingRecord = Prisma.VendorRatingGetPayload<{ select: typeof ratingSelect }>;

function toListDto(po: ListRecord | PoDetailRecord): PoListItemDto {
  return {
    id: po.id,
    number: po.number,
    status: po.status,
    orderDate: dateOnly(po.orderDate),
    expectedDate: optionalDate(po.expectedDate),
    total: po.total.toFixed(2),
    vendor: { id: po.vendor.id, code: po.vendor.code, name: po.vendor.name },
    pr: { id: po.pr.id, number: po.pr.number, title: po.pr.title },
    itemCount: po._count.items,
    issuedAt: iso(po.issuedAt),
    createdAt: iso(po.createdAt),
  };
}

function toRatingDto(r: RatingRecord): VendorRatingDto {
  return {
    ...r,
    average: Math.round(((r.onTime + r.quality + r.price + r.service) / 4) * 10) / 10,
    createdAt: iso(r.createdAt),
  };
}

function toDto(po: PoDetailRecord): PoDto {
  return {
    ...toListDto(po),
    subtotal: po.subtotal.toFixed(2),
    taxPercent: po.taxPercent.toFixed(2),
    taxAmount: po.taxAmount.toFixed(2),
    deliveryAddress: po.deliveryAddress,
    terms: po.terms,
    notes: po.notes,
    items: po.items.map((i) => ({
      id: i.id,
      prItemId: i.prItemId,
      item: i.item,
      name: i.name,
      unit: i.unit,
      qty: i.qty,
      receivedQty: i.receivedQty,
      unitPrice: i.unitPrice.toFixed(2),
      subtotal: i.subtotal.toFixed(2),
    })),
    quotation: po.quotation,
    requester: po.pr.requester,
    division: po.pr.division,
    createdBy: po.createdBy,
    issuedBy: po.issuedBy,
    cancellation:
      po.cancelReason && po.cancelledAt
        ? { reason: po.cancelReason, at: iso(po.cancelledAt) }
        : null,
    rating: po.rating ? toRatingDto(po.rating) : null,
    updatedAt: iso(po.updatedAt),
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function list(q: ListQuery) {
  const where: Prisma.PurchaseOrderWhereInput = {
    AND: [
      q.search
        ? {
            OR: [
              { number: { contains: q.search, mode: 'insensitive' } },
              { vendor: { name: { contains: q.search, mode: 'insensitive' } } },
              { pr: { number: { contains: q.search, mode: 'insensitive' } } },
              { pr: { title: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {},
      {
        ...(q.status && { status: q.status }),
        ...(q.vendorId && { vendorId: q.vendorId }),
        ...((q.dateFrom || q.dateTo) && {
          orderDate: {
            ...(q.dateFrom && { gte: new Date(q.dateFrom) }),
            ...(q.dateTo && { lte: new Date(q.dateTo) }),
          },
        }),
      },
    ],
  };
  const [rows, total] = await prisma.$transaction([
    prisma.purchaseOrder.findMany({
      where,
      select: listSelect,
      orderBy: buildOrderBy<Prisma.PurchaseOrderOrderByWithRelationInput>(
        q.sort,
        ['number', 'status', 'orderDate', 'expectedDate', 'total', 'createdAt', 'vendor.name'],
        { createdAt: 'desc' },
      ),
      ...pageArgs(q),
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  return { data: rows.map(toListDto), meta: pageMeta(q, total) };
}

export async function findOrThrow(id: string, db: TxClient = prisma): Promise<PoDetailRecord> {
  const po = await db.purchaseOrder.findUnique({ where: { id }, select: detailSelect });
  if (!po) throw AppError.notFound('Purchase Order tidak ditemukan');
  return po;
}

export async function get(id: string): Promise<PoDto> {
  return toDto(await findOrThrow(id));
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/** Moves the PO from `po.status` to `to` (guarded against concurrent changes) and audits it. */
async function transitionPo(
  tx: TxClient,
  po: { id: string; status: PoStatus; number: string },
  to: PoStatus,
  actor: Actor,
  data: Prisma.PurchaseOrderUncheckedUpdateManyInput = {},
  note: string | null = null,
): Promise<void> {
  assertTransition(PO_TRANSITIONS, po.status, to, PO_STATUS_LABELS);
  const { count } = await tx.purchaseOrder.updateMany({
    where: { id: po.id, status: po.status },
    data: { ...data, status: to },
  });
  if (count === 0) {
    throw new AppError(
      409,
      'CONCURRENT_UPDATE',
      'Purchase Order telah diubah oleh pengguna lain. Muat ulang halaman.',
    );
  }
  await writeAuditLog(tx, {
    actor,
    action: 'STATUS_CHANGE',
    entity: ENTITY,
    entityId: po.id,
    before: { status: po.status },
    after: { status: to, number: po.number, note },
  });
}

function editableFields(input: PoUpdatePayload) {
  return {
    orderDate: new Date(input.orderDate),
    expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
    deliveryAddress: input.deliveryAddress,
    terms: input.terms,
    notes: input.notes,
  };
}

/** Generates a DRAFT PO from the PR's selected quotation. */
export async function create(input: PoCreatePayload, actor: Actor): Promise<PoDto> {
  const settings = await getSettings();
  const created = await prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUnique({
      where: { id: input.quotationId },
      select: {
        id: true,
        prId: true,
        isSelected: true,
        totalAmount: true,
        vendor: { select: { id: true, name: true, status: true, deletedAt: true } },
        items: {
          select: {
            prItemId: true,
            unitPrice: true,
            qty: true,
            subtotal: true,
            prItem: {
              select: {
                itemId: true,
                freeTextName: true,
                unit: true,
                sortOrder: true,
                item: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!quotation) throw AppError.notFound('Penawaran tidak ditemukan');
    await lockEditablePr(tx, quotation.prId);
    if (!quotation.isSelected) {
      throw new AppError(
        409,
        'QUOTATION_NOT_SELECTED',
        'Purchase Order hanya dapat dibuat dari penawaran pemenang',
      );
    }
    if (quotation.vendor.status !== 'ACTIVE' || quotation.vendor.deletedAt) {
      throw new AppError(
        409,
        'VENDOR_NOT_ACTIVE',
        `Vendor ${quotation.vendor.name} tidak berstatus Aktif`,
      );
    }

    const number = await nextDocumentNumber(tx, DOCUMENT_PREFIX.PURCHASE_ORDER);
    const totals = computeTotals(quotation.totalAmount, input.taxPercent);
    const items = [...quotation.items]
      .sort((a, b) => a.prItem.sortOrder - b.prItem.sortOrder)
      .map((line, index) => ({
        prItemId: line.prItemId,
        itemId: line.prItem.itemId,
        name: line.prItem.item?.name ?? line.prItem.freeTextName ?? '',
        unit: line.prItem.unit,
        qty: line.qty,
        unitPrice: line.unitPrice,
        subtotal: line.subtotal,
        sortOrder: index,
      }));

    const po = await tx.purchaseOrder.create({
      data: {
        ...editableFields(input),
        deliveryAddress: input.deliveryAddress ?? settings.COMPANY_ADDRESS,
        terms: input.terms ?? settings.PO_DEFAULT_TERMS,
        ...totals,
        number,
        prId: quotation.prId,
        vendorId: quotation.vendor.id,
        quotationId: quotation.id,
        createdById: actor.userId,
        items: { create: items },
      },
      select: detailSelect,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: ENTITY,
      entityId: po.id,
      after: toDto(po),
    });
    return po;
  });
  return toDto(created);
}

async function findDraft(tx: TxClient, id: string): Promise<PoDetailRecord> {
  const po = await findOrThrow(id, tx);
  if (po.status !== 'DRAFT') {
    throw new AppError(409, 'INVALID_STATUS', 'Hanya PO berstatus Draft yang dapat diubah');
  }
  return po;
}

export async function update(id: string, input: PoUpdatePayload, actor: Actor): Promise<PoDto> {
  const updated = await prisma.$transaction(async (tx) => {
    const before = await findDraft(tx, id);
    const po = await tx.purchaseOrder.update({
      where: { id },
      data: { ...editableFields(input), ...computeTotals(before.subtotal, input.taxPercent) },
      select: detailSelect,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before: toDto(before),
      after: toDto(po),
    });
    return po;
  });
  return toDto(updated);
}

/** DRAFT → ISSUED; the PR moves to PO_ISSUED and the PO prices enter the price history. */
export async function issue(id: string, actor: Actor): Promise<PoDto> {
  const issued = await prisma.$transaction(async (tx) => {
    const po = await findDraft(tx, id);
    await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${po.prId}::uuid FOR UPDATE`;
    const pr = await tx.purchaseRequest.findUniqueOrThrow({
      where: { id: po.prId },
      select: { id: true, status: true, requesterId: true },
    });

    await transitionPo(tx, po, 'ISSUED', actor, { issuedAt: new Date(), issuedById: actor.userId });
    await transitionPr(
      tx,
      pr,
      'PO_ISSUED',
      actor,
      {},
      `${po.number} diterbitkan ke ${po.vendor.name}`,
    );
    const items = await tx.purchaseOrderItem.findMany({
      where: { poId: id },
      select: { itemId: true, unitPrice: true },
    });
    await recordPrices(tx, { type: 'PO', id, vendorId: po.vendorId, date: po.orderDate }, items);

    const eta = po.expectedDate ? dayjs(po.expectedDate).format('D MMM YYYY') : 'belum ditentukan';
    await notifyUsers(tx, [pr.requesterId], {
      type: 'PR_PO_ISSUED',
      title: `PO terbit: ${po.pr.number}`,
      message: `${po.number} untuk "${po.pr.title}" telah diterbitkan ke ${po.vendor.name}. Estimasi tiba: ${eta}.`,
      link: `/pengajuan/${pr.id}`,
    });
    await notifyUsers(tx, await findUserIdsByRole(tx, 'WAREHOUSE'), {
      type: 'PO_INCOMING',
      title: `Barang akan datang: ${po.number}`,
      message: `${po.vendor.name} akan mengirim ${po._count.items} item (${formatRupiah(po.total.toString())}). Estimasi tiba: ${eta}.`,
      link: `/purchase-order/${id}`,
    });
    return findOrThrow(id, tx);
  });
  return toDto(issued);
}

/**
 * Cancels a DRAFT PO, or an ISSUED one before anything was received. An issued PO sends
 * the PR back to QUOTATION so procurement can choose again.
 */
export async function cancel(id: string, reason: string, actor: Actor): Promise<PoDto> {
  const cancelled = await prisma.$transaction(async (tx) => {
    const po = await findOrThrow(id, tx);
    await transitionPo(
      tx,
      po,
      'CANCELLED',
      actor,
      { cancelReason: reason, cancelledAt: new Date() },
      reason,
    );
    if (po.status === 'ISSUED') {
      await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${po.prId}::uuid FOR UPDATE`;
      await transitionPr(
        tx,
        { id: po.prId, status: po.pr.status },
        'QUOTATION',
        actor,
        {},
        `${po.number} dibatalkan: ${reason}`,
      );
      await removePrices(tx, 'PO', id);
      await notifyUsers(tx, [po.pr.requester.id], {
        type: 'PR_PO_CANCELLED',
        title: `PO dibatalkan: ${po.pr.number}`,
        message: `${po.number} dibatalkan (${reason}). Pengadaan akan memilih ulang vendor.`,
        link: `/pengajuan/${po.prId}`,
      });
    }
    return findOrThrow(id, tx);
  });
  return toDto(cancelled);
}

/** Called when a PR is cancelled: its draft PO (if any) is cancelled with it. */
export async function cancelDraftPosForPr(
  tx: TxClient,
  prId: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const drafts = await tx.purchaseOrder.findMany({
    where: { prId, status: 'DRAFT' },
    select: { id: true, status: true, number: true },
  });
  for (const po of drafts) {
    await transitionPo(
      tx,
      po,
      'CANCELLED',
      actor,
      { cancelReason: `Pengajuan dibatalkan: ${reason}`, cancelledAt: new Date() },
      reason,
    );
  }
}

/** One rating per PO, once goods have (at least partly) arrived. */
export async function rate(id: string, input: VendorRatingPayload, actor: Actor): Promise<PoDto> {
  const rated = await prisma.$transaction(async (tx) => {
    const po = await findOrThrow(id, tx);
    if (!PO_RATABLE_STATUSES.includes(po.status)) {
      throw new AppError(
        409,
        'INVALID_STATUS',
        'Vendor dapat dinilai setelah barang dari PO ini diterima',
      );
    }
    if (po.rating) throw AppError.conflict('PO ini sudah dinilai');
    const rating = await tx.vendorRating.create({
      data: {
        vendorId: po.vendorId,
        poId: id,
        ...input,
        ratedById: actor.userId,
      },
      select: ratingSelect,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: 'VendorRating',
      entityId: rating.id,
      after: { poId: id, vendorId: po.vendorId, ...input },
    });
    return findOrThrow(id, tx);
  });
  return toDto(rated);
}
