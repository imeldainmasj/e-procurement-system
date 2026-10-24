import type { VendorDto, VendorPayload, vendorListQuerySchema } from '@sipita/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { buildOrderBy, pageArgs, pageMeta, searchFilter } from '../../utils/pagination.js';

type ListQuery = z.output<typeof vendorListQuerySchema>;

const ENTITY = 'Vendor';
const active = { deletedAt: null };

const vendorSelect = {
  id: true,
  code: true,
  name: true,
  address: true,
  picName: true,
  npwp: true,
  email: true,
  phone: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { works: { where: active }, agreements: { where: active } } },
} satisfies Prisma.VendorSelect;

type VendorRecord = Prisma.VendorGetPayload<{ select: typeof vendorSelect }>;

function toDto(v: VendorRecord): VendorDto {
  const { _count, createdAt, updatedAt, ...fields } = v;
  return {
    ...fields,
    workCount: _count.works,
    agreementCount: _count.agreements,
    createdAt: iso(createdAt),
    updatedAt: iso(updatedAt),
  };
}

export async function list(q: ListQuery) {
  const where: Prisma.VendorWhereInput = {
    ...active,
    ...searchFilter(q.search, ['code', 'name', 'picName', 'npwp']),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.vendor.findMany({
      where,
      select: vendorSelect,
      orderBy: buildOrderBy<Prisma.VendorOrderByWithRelationInput>(
        q.sort,
        ['code', 'name', 'picName', 'createdAt'],
        { name: 'asc' },
      ),
      ...pageArgs(q),
    }),
    prisma.vendor.count({ where }),
  ]);
  return { data: rows.map(toDto), meta: pageMeta(q, total) };
}

async function findOrThrow(id: string): Promise<VendorRecord> {
  const vendor = await prisma.vendor.findFirst({ where: { id, ...active }, select: vendorSelect });
  if (!vendor) throw AppError.notFound('Vendor tidak ditemukan');
  return vendor;
}

export async function get(id: string): Promise<VendorDto> {
  return toDto(await findOrThrow(id));
}

/** Code and NPWP stay reserved after a soft delete, so the checks include deleted vendors. */
async function assertValid(input: VendorPayload, currentId?: string): Promise<void> {
  const notCurrent = currentId ? { NOT: { id: currentId } } : {};
  if (await prisma.vendor.findFirst({ where: { code: input.code, ...notCurrent } })) {
    throw AppError.conflict(`Kode vendor ${input.code} sudah digunakan`);
  }
  if (
    input.npwp &&
    (await prisma.vendor.findFirst({ where: { npwp: input.npwp, ...notCurrent } }))
  ) {
    throw AppError.conflict(`NPWP ${input.npwp} sudah terdaftar pada vendor lain`);
  }
}

export async function create(input: VendorPayload, actor: Actor): Promise<VendorDto> {
  await assertValid(input);
  return prisma.$transaction(async (tx) => {
    const created = await tx.vendor.create({
      data: { ...input, createdById: actor.userId, updatedById: actor.userId },
      select: vendorSelect,
    });
    const dto = toDto(created);
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: ENTITY,
      entityId: dto.id,
      after: dto,
    });
    return dto;
  });
}

export async function update(id: string, input: VendorPayload, actor: Actor): Promise<VendorDto> {
  const before = await findOrThrow(id);
  await assertValid(input, id);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.vendor.update({
      where: { id },
      data: { ...input, updatedById: actor.userId },
      select: vendorSelect,
    });
    const dto = toDto(updated);
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before: toDto(before),
      after: dto,
    });
    return dto;
  });
}

/** A vendor that already appears in works or agreements stays, so the history keeps its name. */
export async function remove(id: string, actor: Actor): Promise<void> {
  const vendor = await findOrThrow(id);
  if (vendor._count.works > 0 || vendor._count.agreements > 0) {
    throw AppError.conflict(
      'Vendor sudah tercatat pada pekerjaan atau kontrak dan tidak dapat dihapus',
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.vendor.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: actor.userId },
    });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: ENTITY,
      entityId: id,
      before: toDto(vendor),
    });
  });
}
