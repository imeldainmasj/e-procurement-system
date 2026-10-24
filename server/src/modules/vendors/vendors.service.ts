import {
  documentExpiryState,
  VENDOR_DOCUMENT_EXPIRY_WARNING_DAYS,
  VENDOR_STATUS_LABELS,
  type RatingSummaryDto,
  type VendorDocumentDto,
  type VendorDto,
  type VendorListItemDto,
  type VendorPayload,
  type VendorRatingDto,
  type VendorStatus,
  type vendorDocumentInputSchema,
  type vendorListQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { dayjs } from '../../lib/dayjs.js';
import { prisma } from '../../lib/prisma.js';
import { removeFile } from '../../lib/storage.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { buildOrderBy, pageArgs, pageMeta, searchFilter } from '../../utils/pagination.js';
import {
  attachmentSelect,
  byRoles,
  createAttachment,
  registerAttachmentAccess,
  toAttachmentDto,
  type UploadedFile,
  withStoredFile,
} from '../attachments/attachments.service.js';

type ListQuery = z.output<typeof vendorListQuerySchema>;
type DocumentPayload = z.output<typeof vendorDocumentInputSchema>;

const ENTITY = 'Vendor';
const DOCUMENT_REF = 'VendorDocument';

/** Who may read vendor data (SUPER_ADMIN implied); only PROCUREMENT edits. */
export const VENDOR_READ_ROLES = ['PROCUREMENT', 'VIEWER'] as const;

registerAttachmentAccess(DOCUMENT_REF, byRoles(...VENDOR_READ_ROLES));

const today = () => dayjs().tz().format('YYYY-MM-DD');
const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const round1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);

// ─── Selects & mapping ───────────────────────────────────────────────────────

const listSelect = {
  id: true,
  code: true,
  name: true,
  city: true,
  picName: true,
  phone: true,
  email: true,
  status: true,
  createdAt: true,
  categories: {
    select: { category: { select: { id: true, name: true } } },
    orderBy: { category: { name: 'asc' } },
  },
} satisfies Prisma.VendorSelect;

const detailSelect = {
  ...listSelect,
  npwp: true,
  address: true,
  bankName: true,
  bankAccount: true,
  bankAccountName: true,
  statusReason: true,
  notes: true,
  updatedAt: true,
  documents: {
    orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      type: true,
      number: true,
      expiresAt: true,
      notes: true,
      createdAt: true,
      attachment: { select: attachmentSelect },
    },
  },
} satisfies Prisma.VendorSelect;

type ListRecord = Prisma.VendorGetPayload<{ select: typeof listSelect }>;
type DetailRecord = Prisma.VendorGetPayload<{ select: typeof detailSelect }>;
type DocumentRecord = DetailRecord['documents'][number];

interface RatingAggregate {
  _count: { _all: number };
  _avg: {
    onTime: number | null;
    quality: number | null;
    price: number | null;
    service: number | null;
  };
}

function summarize(agg: RatingAggregate | undefined): RatingSummaryDto {
  const avg = agg?._avg;
  const parts = avg ? [avg.onTime, avg.quality, avg.price, avg.service] : [];
  const overall =
    parts.length && parts.every((p) => p !== null)
      ? (parts as number[]).reduce((a, b) => a + b, 0) / parts.length
      : null;
  return {
    count: agg?._count._all ?? 0,
    overall: round1(overall),
    onTime: round1(avg?.onTime),
    quality: round1(avg?.quality),
    price: round1(avg?.price),
    service: round1(avg?.service),
  };
}

async function ratingAggregates(vendorIds: string[]): Promise<Map<string, RatingAggregate>> {
  if (vendorIds.length === 0) return new Map();
  const rows = await prisma.vendorRating.groupBy({
    by: ['vendorId'],
    where: { vendorId: { in: vendorIds } },
    _count: { _all: true },
    _avg: { onTime: true, quality: true, price: true, service: true },
  });
  return new Map(rows.map((r) => [r.vendorId, r]));
}

/** Expired / expiring-soon document counts per vendor. */
async function documentAlerts(
  vendorIds: string[],
): Promise<Map<string, { expired: number; expiring: number }>> {
  const limit = dayjs
    .tz(today())
    .add(VENDOR_DOCUMENT_EXPIRY_WARNING_DAYS, 'day')
    .format('YYYY-MM-DD');
  const docs = await prisma.vendorDocument.findMany({
    where: { vendorId: { in: vendorIds }, expiresAt: { lte: new Date(limit) } },
    select: { vendorId: true, expiresAt: true },
  });
  const result = new Map<string, { expired: number; expiring: number }>();
  for (const doc of docs) {
    const state = documentExpiryState(dateOnly(doc.expiresAt), today());
    const entry = result.get(doc.vendorId) ?? { expired: 0, expiring: 0 };
    if (state === 'expired') entry.expired++;
    else if (state === 'expiring') entry.expiring++;
    result.set(doc.vendorId, entry);
  }
  return result;
}

function toListDto(
  v: ListRecord,
  rating: RatingSummaryDto,
  alerts: { expired: number; expiring: number } = { expired: 0, expiring: 0 },
): VendorListItemDto {
  return {
    id: v.id,
    code: v.code,
    name: v.name,
    city: v.city,
    picName: v.picName,
    phone: v.phone,
    email: v.email,
    status: v.status,
    categories: v.categories.map((c) => c.category),
    rating: { overall: rating.overall, count: rating.count },
    documentAlerts: alerts,
    createdAt: iso(v.createdAt),
  };
}

function toDocumentDto(d: DocumentRecord): VendorDocumentDto {
  const expiresAt = dateOnly(d.expiresAt);
  return {
    id: d.id,
    type: d.type,
    number: d.number,
    expiresAt,
    expiryState: documentExpiryState(expiresAt, today()),
    notes: d.notes,
    attachment: toAttachmentDto(d.attachment),
    createdAt: iso(d.createdAt),
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function list(q: ListQuery) {
  const where: Prisma.VendorWhereInput = {
    deletedAt: null,
    ...searchFilter(q.search, ['code', 'name', 'npwp', 'picName', 'city']),
    ...(q.status && { status: q.status }),
    ...(q.categoryId && { categories: { some: { categoryId: q.categoryId } } }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.vendor.findMany({
      where,
      select: listSelect,
      orderBy: buildOrderBy<Prisma.VendorOrderByWithRelationInput>(
        q.sort,
        ['code', 'name', 'city', 'status', 'createdAt'],
        { name: 'asc' },
      ),
      ...pageArgs(q),
    }),
    prisma.vendor.count({ where }),
  ]);
  const ids = rows.map((r) => r.id);
  const [ratings, alerts] = await Promise.all([ratingAggregates(ids), documentAlerts(ids)]);
  return {
    data: rows.map((v) => toListDto(v, summarize(ratings.get(v.id)), alerts.get(v.id))),
    meta: pageMeta(q, total),
  };
}

async function findOrThrow(id: string): Promise<DetailRecord> {
  const vendor = await prisma.vendor.findFirst({
    where: { id, deletedAt: null },
    select: detailSelect,
  });
  if (!vendor) throw AppError.notFound('Vendor tidak ditemukan');
  return vendor;
}

async function toDto(v: DetailRecord): Promise<VendorDto> {
  const [ratings, alerts] = await Promise.all([ratingAggregates([v.id]), documentAlerts([v.id])]);
  const ratingSummary = summarize(ratings.get(v.id));
  return {
    ...toListDto(v, ratingSummary, alerts.get(v.id)),
    npwp: v.npwp,
    address: v.address,
    bankName: v.bankName,
    bankAccount: v.bankAccount,
    bankAccountName: v.bankAccountName,
    statusReason: v.statusReason,
    notes: v.notes,
    documents: v.documents.map(toDocumentDto),
    ratingSummary,
    updatedAt: iso(v.updatedAt),
  };
}

export async function get(id: string): Promise<VendorDto> {
  return toDto(await findOrThrow(id));
}

export async function listRatings(vendorId: string, q: { page: number; limit: number }) {
  await findOrThrow(vendorId);
  const where = { vendorId };
  const [rows, total] = await prisma.$transaction([
    prisma.vendorRating.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        poId: true,
        onTime: true,
        quality: true,
        price: true,
        service: true,
        notes: true,
        createdAt: true,
        ratedBy: { select: { id: true, name: true } },
      },
      ...pageArgs(q),
    }),
    prisma.vendorRating.count({ where }),
  ]);
  const data: VendorRatingDto[] = rows.map((r) => ({
    ...r,
    average: round1((r.onTime + r.quality + r.price + r.service) / 4)!,
    createdAt: iso(r.createdAt),
  }));
  return { data, meta: pageMeta(q, total) };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

async function assertValid(input: VendorPayload, currentId?: string): Promise<void> {
  const notCurrent = currentId ? { NOT: { id: currentId } } : {};
  if (await prisma.vendor.findFirst({ where: { code: input.code, ...notCurrent } })) {
    throw AppError.conflict(`Kode vendor ${input.code} sudah digunakan`);
  }
  if (
    input.npwp &&
    (await prisma.vendor.findFirst({ where: { npwp: input.npwp, ...notCurrent } }))
  ) {
    throw AppError.conflict('NPWP sudah terdaftar untuk vendor lain');
  }
  const categoryIds = [...new Set(input.categoryIds)];
  if (categoryIds.length > 0) {
    const found = await prisma.itemCategory.count({
      where: { id: { in: categoryIds }, deletedAt: null },
    });
    if (found !== categoryIds.length)
      throw AppError.badRequest('Sebagian kategori tidak ditemukan');
  }
}

function vendorData(input: VendorPayload) {
  const { categoryIds, ...data } = input;
  return { data, categories: [...new Set(categoryIds)].map((categoryId) => ({ categoryId })) };
}

export async function create(input: VendorPayload, actor: Actor): Promise<VendorDto> {
  await assertValid(input);
  const { data, categories } = vendorData(input);
  const vendor = await prisma.$transaction(async (tx) => {
    // New vendors start UNDER_REVIEW until procurement verifies their documents.
    const created = await tx.vendor.create({
      data: { ...data, createdById: actor.userId, categories: { create: categories } },
      select: detailSelect,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: ENTITY,
      entityId: created.id,
      after: input,
    });
    return created;
  });
  return toDto(vendor);
}

export async function update(id: string, input: VendorPayload, actor: Actor): Promise<VendorDto> {
  const before = await findOrThrow(id);
  await assertValid(input, id);
  const { data, categories } = vendorData(input);
  const vendor = await prisma.$transaction(async (tx) => {
    const updated = await tx.vendor.update({
      where: { id },
      data: { ...data, categories: { deleteMany: {}, create: categories } },
      select: detailSelect,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before: { ...before, documents: undefined },
      after: input,
    });
    return updated;
  });
  return toDto(vendor);
}

export async function changeStatus(
  id: string,
  status: VendorStatus,
  reason: string | null,
  actor: Actor,
): Promise<VendorDto> {
  const before = await findOrThrow(id);
  if (before.status === status) {
    throw AppError.badRequest(`Status vendor sudah ${VENDOR_STATUS_LABELS[status]}`);
  }
  const vendor = await prisma.$transaction(async (tx) => {
    const updated = await tx.vendor.update({
      where: { id },
      data: { status, statusReason: reason },
      select: detailSelect,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'STATUS_CHANGE',
      entity: ENTITY,
      entityId: id,
      before: { status: before.status, reason: before.statusReason },
      after: { status, reason },
    });
    return updated;
  });
  return toDto(vendor);
}

/** Vendors still involved in an open quotation round or an open PO cannot be deleted. */
export async function remove(id: string, actor: Actor): Promise<void> {
  const vendor = await findOrThrow(id);
  const [openQuotations, openPos] = await Promise.all([
    prisma.quotation.count({
      where: { vendorId: id, pr: { status: { in: ['APPROVED', 'QUOTATION'] } } },
    }),
    prisma.purchaseOrder.count({
      where: { vendorId: id, status: { in: ['DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED'] } },
    }),
  ]);
  if (openQuotations > 0 || openPos > 0) {
    throw AppError.conflict(
      'Vendor masih memiliki penawaran atau Purchase Order yang sedang berjalan. Ubah statusnya menjadi Nonaktif sebagai gantinya.',
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.vendor.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: ENTITY,
      entityId: id,
      before: { code: vendor.code, name: vendor.name, status: vendor.status },
    });
  });
}

// ─── Documents ───────────────────────────────────────────────────────────────

export async function addDocument(
  vendorId: string,
  input: DocumentPayload,
  file: UploadedFile | undefined,
  actor: Actor,
): Promise<VendorDocumentDto> {
  await findOrThrow(vendorId);
  const doc = await withStoredFile(file, (stored) =>
    prisma.$transaction(async (tx) => {
      const documentId = crypto.randomUUID();
      await createAttachment(tx, file!, stored, { type: DOCUMENT_REF, id: documentId }, actor);
      const created = await tx.vendorDocument.create({
        data: {
          id: documentId,
          vendorId,
          type: input.type,
          number: input.number,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          notes: input.notes,
          attachmentId: stored.attachmentId,
          uploadedById: actor.userId,
        },
        select: detailSelect.documents.select,
      });
      await writeAuditLog(tx, {
        actor,
        action: 'CREATE',
        entity: DOCUMENT_REF,
        entityId: documentId,
        after: {
          vendorId,
          type: input.type,
          number: input.number,
          expiresAt: input.expiresAt,
          file: file!.originalname,
        },
      });
      return created;
    }),
  );
  return toDocumentDto(doc);
}

export async function removeDocument(
  vendorId: string,
  documentId: string,
  actor: Actor,
): Promise<void> {
  const doc = await prisma.vendorDocument.findFirst({
    where: { id: documentId, vendorId, vendor: { deletedAt: null } },
    select: {
      id: true,
      type: true,
      number: true,
      attachment: { select: { id: true, path: true, fileName: true } },
    },
  });
  if (!doc) throw AppError.notFound('Dokumen tidak ditemukan');

  await prisma.$transaction(async (tx) => {
    await tx.vendorDocument.delete({ where: { id: doc.id } });
    await tx.attachment.delete({ where: { id: doc.attachment.id } });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: DOCUMENT_REF,
      entityId: doc.id,
      before: { vendorId, type: doc.type, number: doc.number, file: doc.attachment.fileName },
    });
  });
  // Only delete the file once the rows are gone, so a failed transaction keeps it.
  await removeFile(doc.attachment.path);
}
