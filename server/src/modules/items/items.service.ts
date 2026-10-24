import type { ItemDto, ItemPayload, itemListQuerySchema } from '@sipita/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { buildOrderBy, pageArgs, pageMeta, searchFilter } from '../../utils/pagination.js';

type ListQuery = z.output<typeof itemListQuerySchema>;

const ENTITY = 'Item';

const itemSelect = {
  id: true,
  code: true,
  name: true,
  unit: true,
  isAsset: true,
  minStock: true,
  specs: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ItemSelect;

type ItemRecord = Prisma.ItemGetPayload<{ select: typeof itemSelect }>;

function toSpecs(value: Prisma.JsonValue): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v ?? '')]));
}

function toDto(i: ItemRecord): ItemDto {
  return {
    id: i.id,
    code: i.code,
    name: i.name,
    unit: i.unit,
    isAsset: i.isAsset,
    minStock: i.minStock,
    specs: toSpecs(i.specs),
    description: i.description,
    category: i.category,
    createdAt: iso(i.createdAt),
    updatedAt: iso(i.updatedAt),
  };
}

export async function list(q: ListQuery) {
  const where: Prisma.ItemWhereInput = {
    deletedAt: null,
    ...searchFilter(q.search, ['code', 'name']),
    ...(q.categoryId && { categoryId: q.categoryId }),
    ...(q.isAsset !== undefined && { isAsset: q.isAsset }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.item.findMany({
      where,
      select: itemSelect,
      orderBy: buildOrderBy<Prisma.ItemOrderByWithRelationInput>(
        q.sort,
        ['code', 'name', 'unit', 'minStock', 'createdAt', 'category.name'],
        { code: 'asc' },
      ),
      ...pageArgs(q),
    }),
    prisma.item.count({ where }),
  ]);
  return { data: rows.map(toDto), meta: pageMeta(q, total) };
}

async function findOrThrow(id: string): Promise<ItemRecord> {
  const item = await prisma.item.findFirst({ where: { id, deletedAt: null }, select: itemSelect });
  if (!item) throw AppError.notFound('Item tidak ditemukan');
  return item;
}

export async function get(id: string): Promise<ItemDto> {
  return toDto(await findOrThrow(id));
}

async function assertValid(input: ItemPayload, currentId?: string): Promise<void> {
  const sameCode = await prisma.item.findFirst({
    where: { code: input.code, NOT: currentId ? { id: currentId } : undefined },
  });
  if (sameCode) throw AppError.conflict(`Kode item ${input.code} sudah digunakan`);

  const category = await prisma.itemCategory.findFirst({
    where: { id: input.categoryId, deletedAt: null },
  });
  if (!category) throw AppError.badRequest('Kategori tidak ditemukan');
}

export async function create(input: ItemPayload, actor: Actor): Promise<ItemDto> {
  await assertValid(input);
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.item.create({ data: input, select: itemSelect });
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: ENTITY,
      entityId: created.id,
      after: input,
    });
    return created;
  });
  return toDto(item);
}

export async function update(id: string, input: ItemPayload, actor: Actor): Promise<ItemDto> {
  const before = await findOrThrow(id);
  await assertValid(input, id);
  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.item.update({ where: { id }, data: input, select: itemSelect });
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
  return toDto(item);
}

// Stock/asset references are checked here once the warehouse module exists (stage 8).
export async function remove(id: string, actor: Actor): Promise<void> {
  const item = await findOrThrow(id);
  await prisma.$transaction(async (tx) => {
    await tx.item.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: ENTITY,
      entityId: id,
      before: toDto(item),
    });
  });
}
