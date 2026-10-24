import {
  PROCUREMENT_READ_ROLES,
  QUOTATION_PR_STATUSES,
  SELECTION_REASON_LABELS,
  selectionJustificationReasons,
  type QuotationComparisonDto,
  type QuotationCreatePayload,
  type QuotationDto,
  type QuotationPayload,
} from '@sipita/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import { removeFile } from '../../lib/storage.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import {
  attachmentSelect,
  byRoles,
  createAttachment,
  registerAttachmentAccess,
  toAttachmentDto,
  type UploadedFile,
  withStoredFile,
} from '../attachments/attachments.service.js';
import { recordPrices, removePrices } from '../price-history/price-history.service.js';
import { transitionPr } from '../purchase-requests/pr-status.js';
import { getSettings } from '../settings/settings.service.js';

const ENTITY = 'Quotation';

registerAttachmentAccess(ENTITY, byRoles(...PROCUREMENT_READ_ROLES));

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const today = () => dayjs().tz().format('YYYY-MM-DD');

// ─── Selects & mapping ───────────────────────────────────────────────────────

export const quotationSelect = {
  id: true,
  prId: true,
  quoteNumber: true,
  quoteDate: true,
  validUntil: true,
  deliveryDays: true,
  paymentTerms: true,
  totalAmount: true,
  notes: true,
  isSelected: true,
  selectedAt: true,
  selectionJustification: true,
  createdAt: true,
  updatedAt: true,
  vendor: { select: { id: true, code: true, name: true, status: true, deletedAt: true } },
  selectedBy: { select: { id: true, name: true } },
  attachment: { select: attachmentSelect },
  items: {
    select: { id: true, prItemId: true, unitPrice: true, qty: true, subtotal: true, notes: true },
  },
} satisfies Prisma.QuotationSelect;

type QuotationRecord = Prisma.QuotationGetPayload<{ select: typeof quotationSelect }>;

function toDto(q: QuotationRecord): QuotationDto {
  const { deletedAt: _deleted, ...vendor } = q.vendor;
  return {
    id: q.id,
    vendor,
    quoteNumber: q.quoteNumber,
    quoteDate: dateOnly(q.quoteDate),
    validUntil: q.validUntil ? dateOnly(q.validUntil) : null,
    deliveryDays: q.deliveryDays,
    paymentTerms: q.paymentTerms,
    totalAmount: q.totalAmount.toFixed(2),
    notes: q.notes,
    attachment: q.attachment ? toAttachmentDto(q.attachment) : null,
    isSelected: q.isSelected,
    selectedAt: iso(q.selectedAt),
    selectedBy: q.selectedBy,
    selectionJustification: q.selectionJustification,
    items: q.items.map((i) => ({
      id: i.id,
      prItemId: i.prItemId,
      unitPrice: i.unitPrice.toFixed(2),
      qty: i.qty,
      subtotal: i.subtotal.toFixed(2),
      notes: i.notes,
    })),
    createdAt: iso(q.createdAt),
    updatedAt: iso(q.updatedAt),
  };
}

const prSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  neededDate: true,
  estimatedTotal: true,
  requester: { select: { id: true, name: true } },
  division: { select: { id: true, name: true } },
  memo: { select: { totalAmount: true, status: true } },
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
  purchaseOrders: {
    where: { status: { not: 'CANCELLED' } },
    select: { id: true, number: true, status: true },
    take: 1,
  },
} satisfies Prisma.PurchaseRequestSelect;

type PrRecord = Prisma.PurchaseRequestGetPayload<{ select: typeof prSelect }>;

const isEditable = (pr: PrRecord) =>
  QUOTATION_PR_STATUSES.includes(pr.status) && pr.purchaseOrders.length === 0;

const approvedAmount = (pr: PrRecord) => pr.memo?.totalAmount ?? pr.estimatedTotal;

// ─── Loading & guards ────────────────────────────────────────────────────────

async function loadPr(prId: string, db: TxClient = prisma): Promise<PrRecord> {
  const pr = await db.purchaseRequest.findUnique({ where: { id: prId }, select: prSelect });
  if (!pr || pr.status === 'DRAFT') throw AppError.notFound('Pengajuan tidak ditemukan');
  return pr;
}

/**
 * Locks the PR row so concurrent quotation changes (selection, first quotation moving the
 * PR to QUOTATION, PO creation) are serialized, then checks quotations may still change.
 */
export async function lockEditablePr(tx: TxClient, prId: string): Promise<PrRecord> {
  await tx.$queryRaw`SELECT id FROM purchase_requests WHERE id = ${prId}::uuid FOR UPDATE`;
  const pr = await loadPr(prId, tx);
  if (!QUOTATION_PR_STATUSES.includes(pr.status)) {
    throw new AppError(
      409,
      'INVALID_STATUS',
      'Penawaran hanya dapat dikelola untuk pengajuan yang sudah disetujui',
    );
  }
  if (pr.purchaseOrders.length > 0) {
    throw new AppError(
      409,
      'PO_EXISTS',
      `Purchase Order ${pr.purchaseOrders[0]!.number} sudah dibuat. Batalkan PO untuk mengubah penawaran.`,
    );
  }
  return pr;
}

async function findQuotation(id: string, db: TxClient = prisma): Promise<QuotationRecord> {
  const q = await db.quotation.findUnique({ where: { id }, select: quotationSelect });
  if (!q) throw AppError.notFound('Penawaran tidak ditemukan');
  return q;
}

/** Vendors that are blacklisted, inactive or deleted cannot submit quotations. */
async function assertVendorCanQuote(tx: TxClient, vendorId: string): Promise<void> {
  const vendor = await tx.vendor.findFirst({
    where: { id: vendorId, deletedAt: null },
    select: { status: true, name: true },
  });
  if (!vendor) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Vendor tidak ditemukan', [
      { path: 'vendorId', message: 'Vendor tidak ditemukan' },
    ]);
  }
  if (vendor.status === 'BLACKLISTED' || vendor.status === 'INACTIVE') {
    const message = `Vendor ${vendor.name} berstatus ${vendor.status === 'BLACKLISTED' ? 'blacklist' : 'nonaktif'} dan tidak dapat mengajukan penawaran`;
    throw new AppError(400, 'VALIDATION_ERROR', message, [{ path: 'vendorId', message }]);
  }
}

async function assertUniqueVendor(
  tx: TxClient,
  prId: string,
  vendorId: string,
  currentId?: string,
): Promise<void> {
  const existing = await tx.quotation.findFirst({
    where: { prId, vendorId, ...(currentId && { NOT: { id: currentId } }) },
    select: { id: true },
  });
  if (existing) {
    const message = 'Vendor ini sudah memiliki penawaran untuk pengajuan ini';
    throw new AppError(409, 'CONFLICT', message, [{ path: 'vendorId', message }]);
  }
}

/** Every PR item exactly once; quantities come from the PR. */
function buildItems(pr: PrRecord, input: QuotationPayload) {
  const prItems = new Map(pr.items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  for (const [index, line] of input.items.entries()) {
    if (!prItems.has(line.prItemId) || seen.has(line.prItemId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Item penawaran tidak sesuai dengan pengajuan', [
        { path: `items.${index}.prItemId`, message: 'Item tidak ada di pengajuan' },
      ]);
    }
    seen.add(line.prItemId);
  }
  if (seen.size !== prItems.size) {
    throw AppError.badRequest('Harga semua item pengajuan wajib diisi');
  }
  const items = input.items.map((line) => {
    const prItem = prItems.get(line.prItemId)!;
    const unitPrice = new Prisma.Decimal(line.unitPrice);
    return {
      prItemId: line.prItemId,
      itemId: prItem.itemId,
      unitPrice,
      qty: prItem.qty,
      subtotal: unitPrice.mul(prItem.qty),
      notes: line.notes,
    };
  });
  const totalAmount = items.reduce((sum, i) => sum.add(i.subtotal), new Prisma.Decimal(0));
  return { items, totalAmount };
}

function quotationData(input: QuotationPayload, totalAmount: Prisma.Decimal) {
  return {
    vendorId: input.vendorId,
    quoteNumber: input.quoteNumber,
    quoteDate: new Date(input.quoteDate),
    validUntil: input.validUntil ? new Date(input.validUntil) : null,
    deliveryDays: input.deliveryDays,
    paymentTerms: input.paymentTerms,
    notes: input.notes,
    totalAmount,
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function comparison(prId: string): Promise<QuotationComparisonDto> {
  const [pr, settings] = await Promise.all([loadPr(prId), getSettings()]);
  const quotations = await prisma.quotation.findMany({
    where: { prId },
    orderBy: [{ totalAmount: 'asc' }, { createdAt: 'asc' }],
    select: quotationSelect,
  });
  return {
    pr: {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      status: pr.status,
      neededDate: dateOnly(pr.neededDate),
      estimatedTotal: pr.estimatedTotal.toFixed(2),
      requester: pr.requester,
      division: pr.division,
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
    },
    approvedAmount: approvedAmount(pr).toFixed(2),
    minQuotations: settings.MIN_QUOTATIONS,
    quotations: quotations.map(toDto),
    purchaseOrder: pr.purchaseOrders[0] ?? null,
    editable: isEditable(pr),
  };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function create(input: QuotationCreatePayload, actor: Actor): Promise<QuotationDto> {
  const created = await prisma.$transaction(async (tx) => {
    const pr = await lockEditablePr(tx, input.prId);
    await assertVendorCanQuote(tx, input.vendorId);
    await assertUniqueVendor(tx, pr.id, input.vendorId);
    const { items, totalAmount } = buildItems(pr, input);

    const quotation = await tx.quotation.create({
      data: {
        ...quotationData(input, totalAmount),
        prId: pr.id,
        createdById: actor.userId,
        items: { create: items.map(({ itemId: _itemId, ...item }) => item) },
      },
      select: quotationSelect,
    });
    await recordPrices(
      tx,
      { type: 'QUOTATION', id: quotation.id, vendorId: input.vendorId, date: quotation.quoteDate },
      items,
    );
    if (pr.status === 'APPROVED') {
      await transitionPr(tx, pr, 'QUOTATION', actor, {}, 'Penawaran vendor mulai diinput');
    }
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: ENTITY,
      entityId: quotation.id,
      after: toDto(quotation),
    });
    return quotation;
  });
  return toDto(created);
}

export async function update(
  id: string,
  input: QuotationPayload,
  actor: Actor,
): Promise<QuotationDto> {
  const updated = await prisma.$transaction(async (tx) => {
    const before = await findQuotation(id, tx);
    const pr = await lockEditablePr(tx, before.prId);
    if (before.isSelected) {
      throw new AppError(
        409,
        'QUOTATION_SELECTED',
        'Penawaran pemenang tidak dapat diubah. Batalkan pilihan pemenang terlebih dahulu.',
      );
    }
    if (input.vendorId !== before.vendor.id) {
      await assertVendorCanQuote(tx, input.vendorId);
      await assertUniqueVendor(tx, pr.id, input.vendorId, id);
    }
    const { items, totalAmount } = buildItems(pr, input);

    const quotation = await tx.quotation.update({
      where: { id },
      data: {
        ...quotationData(input, totalAmount),
        items: { deleteMany: {}, create: items.map(({ itemId: _itemId, ...item }) => item) },
      },
      select: quotationSelect,
    });
    await recordPrices(
      tx,
      { type: 'QUOTATION', id, vendorId: input.vendorId, date: quotation.quoteDate },
      items,
    );
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before: toDto(before),
      after: toDto(quotation),
    });
    return quotation;
  });
  return toDto(updated);
}

export async function remove(id: string, actor: Actor): Promise<void> {
  const removed = await prisma.$transaction(async (tx) => {
    const quotation = await findQuotation(id, tx);
    await lockEditablePr(tx, quotation.prId);
    if (quotation.isSelected) {
      throw new AppError(
        409,
        'QUOTATION_SELECTED',
        'Penawaran pemenang tidak dapat dihapus. Batalkan pilihan pemenang terlebih dahulu.',
      );
    }
    await tx.quotation.delete({ where: { id } });
    if (quotation.attachment)
      await tx.attachment.delete({ where: { id: quotation.attachment.id } });
    await removePrices(tx, 'QUOTATION', id);
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: ENTITY,
      entityId: id,
      before: toDto(quotation),
    });
    return quotation;
  });
  if (removed.attachment) await removeFile(removed.attachment.path);
}

/** Attaches (or replaces) the vendor's quotation document. */
export async function uploadFile(
  id: string,
  file: UploadedFile | undefined,
  actor: Actor,
): Promise<QuotationDto> {
  const { quotation, oldPath } = await withStoredFile(file, (stored) =>
    prisma.$transaction(async (tx) => {
      const before = await findQuotation(id, tx);
      await lockEditablePr(tx, before.prId);
      await createAttachment(tx, file!, stored, { type: ENTITY, id }, actor);
      const quotation = await tx.quotation.update({
        where: { id },
        data: { attachmentId: stored.attachmentId },
        select: quotationSelect,
      });
      if (before.attachment) await tx.attachment.delete({ where: { id: before.attachment.id } });
      await writeAuditLog(tx, {
        actor,
        action: 'UPDATE',
        entity: ENTITY,
        entityId: id,
        before: { file: before.attachment?.fileName ?? null },
        after: { file: file!.originalname },
      });
      return { quotation, oldPath: before.attachment?.path ?? null };
    }),
  );
  if (oldPath) await removeFile(oldPath);
  return toDto(quotation);
}

export async function removeFileOf(id: string, actor: Actor): Promise<QuotationDto> {
  const { quotation, oldPath } = await prisma.$transaction(async (tx) => {
    const before = await findQuotation(id, tx);
    await lockEditablePr(tx, before.prId);
    if (!before.attachment) throw AppError.notFound('Penawaran ini belum memiliki file');
    const quotation = await tx.quotation.update({
      where: { id },
      data: { attachmentId: null },
      select: quotationSelect,
    });
    await tx.attachment.delete({ where: { id: before.attachment.id } });
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before: { file: before.attachment.fileName },
      after: { file: null },
    });
    return { quotation, oldPath: before.attachment.path };
  });
  await removeFile(oldPath);
  return toDto(quotation);
}

/**
 * Picks the winning quotation (replacing any previous winner). A justification is required
 * when there are fewer quotations than the configured minimum, the winner is not the
 * cheapest, or it exceeds the amount approved in the memo.
 */
export async function select(
  id: string,
  justification: string | null,
  actor: Actor,
): Promise<QuotationDto> {
  const settings = await getSettings();
  const selected = await prisma.$transaction(async (tx) => {
    const quotation = await findQuotation(id, tx);
    const pr = await lockEditablePr(tx, quotation.prId);
    if (quotation.vendor.status !== 'ACTIVE' || quotation.vendor.deletedAt) {
      throw new AppError(
        409,
        'VENDOR_NOT_ACTIVE',
        `Vendor ${quotation.vendor.name} belum berstatus Aktif dan tidak dapat dipilih sebagai pemenang`,
      );
    }
    if (quotation.validUntil && dateOnly(quotation.validUntil) < today()) {
      throw new AppError(
        409,
        'QUOTATION_EXPIRED',
        'Masa berlaku penawaran sudah habis. Minta penawaran terbaru dari vendor.',
      );
    }

    const all = await tx.quotation.findMany({
      where: { prId: pr.id },
      select: { id: true, totalAmount: true, isSelected: true },
    });
    const reasons = selectionJustificationReasons({
      quotationTotals: all.map((q) => Number(q.totalAmount)),
      selectedTotal: Number(quotation.totalAmount),
      minQuotations: settings.MIN_QUOTATIONS,
      approvedAmount: Number(approvedAmount(pr)),
    });
    if (reasons.length > 0 && !justification) {
      const message = `Justifikasi wajib diisi: ${reasons.map((r) => SELECTION_REASON_LABELS[r].toLowerCase()).join('; ')}`;
      throw new AppError(400, 'VALIDATION_ERROR', message, [{ path: 'justification', message }]);
    }

    const previous = all.find((q) => q.isSelected && q.id !== id);
    await tx.quotation.updateMany({
      where: { prId: pr.id, isSelected: true },
      data: {
        isSelected: false,
        selectedAt: null,
        selectedById: null,
        selectionJustification: null,
      },
    });
    const updated = await tx.quotation.update({
      where: { id },
      data: {
        isSelected: true,
        selectedAt: new Date(),
        selectedById: actor.userId,
        selectionJustification: justification,
      },
      select: quotationSelect,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before: { isSelected: quotation.isSelected, previousWinnerId: previous?.id ?? null },
      after: { isSelected: true, justification, reasons },
    });
    return updated;
  });
  return toDto(selected);
}

export async function unselect(id: string, actor: Actor): Promise<QuotationDto> {
  const updated = await prisma.$transaction(async (tx) => {
    const quotation = await findQuotation(id, tx);
    await lockEditablePr(tx, quotation.prId);
    if (!quotation.isSelected) throw AppError.badRequest('Penawaran ini bukan pemenang');
    const result = await tx.quotation.update({
      where: { id },
      data: {
        isSelected: false,
        selectedAt: null,
        selectedById: null,
        selectionJustification: null,
      },
      select: quotationSelect,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before: { isSelected: true, justification: quotation.selectionJustification },
      after: { isSelected: false },
    });
    return result;
  });
  return toDto(updated);
}
