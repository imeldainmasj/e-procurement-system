import type {
  ItemCategoryDto,
  ItemCategoryPayload,
  itemCategoryListQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { buildOrderBy, pageArgs, pageMeta, searchFilter } from '../../utils/pagination.js';

type ListQuery = z.output<typeof itemCategoryListQuerySchema>;

const ENTITY = 'ItemCategory';

const categorySelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { items: { where: { deletedAt: null } } } },
} satisfies Prisma.ItemCategorySelect;

type CategoryRecord = Prisma.ItemCategoryGetPayload<{ select: typeof categorySelect }>;

function toDto(c: CategoryRecord): ItemCategoryDto {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    description: c.description,
    itemCount: c._count.items,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

export async function list(q: ListQuery) {
  const where: Prisma.ItemCategoryWhereInput = {
    deletedAt: null,
    ...searchFilter(q.search, ['code', 'name']),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.itemCategory.findMany({
      where,
      select: categorySelect,
      orderBy: buildOrderBy<Prisma.ItemCategoryOrderByWithRelationInput>(
        q.sort,
        ['code', 'name', 'createdAt'],
        { code: 'asc' },
      ),
      ...pageArgs(q),
    }),
    prisma.itemCategory.count({ where }),
  ]);
  return { data: rows.map(toDto), meta: pageMeta(q, total) };
}

async function findOrThrow(id: string): Promise<CategoryRecord> {
  const category = await prisma.itemCategory.findFirst({
    where: { id, deletedAt: null },
    select: categorySelect,
  });
  if (!category) throw AppError.notFound('Kategori tidak ditemukan');
  return category;
}

export async function get(id: string): Promise<ItemCategoryDto> {
  return toDto(await findOrThrow(id));
}

async function assertCodeAvailable(code: string, currentId?: string): Promise<void> {
  const existing = await prisma.itemCategory.findFirst({
    where: { code, NOT: currentId ? { id: currentId } : undefined },
  });
  if (existing) throw AppError.conflict(`Kode kategori ${code} sudah digunakan`);
}

export async function create(input: ItemCategoryPayload, actor: Actor): Promise<ItemCategoryDto> {
  await assertCodeAvailable(input.code);
  const category = await prisma.$transaction(async (tx) => {
    const created = await tx.itemCategory.create({ data: input, select: categorySelect });
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: ENTITY,
      entityId: created.id,
      after: input,
    });
    return created;
  });
  return toDto(category);
}

export async function update(
  id: string,
  input: ItemCategoryPayload,
  actor: Actor,
): Promise<ItemCategoryDto> {
  const before = await findOrThrow(id);
  await assertCodeAvailable(input.code, id);
  const category = await prisma.$transaction(async (tx) => {
    const updated = await tx.itemCategory.update({
      where: { id },
      data: input,
      select: categorySelect,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before: { code: before.code, name: before.name, description: before.description },
      after: input,
    });
    return updated;
  });
  return toDto(category);
}

export async function remove(id: string, actor: Actor): Promise<void> {
  const category = await findOrThrow(id);
  if (category._count.items > 0) {
    throw AppError.conflict(
      `Kategori ${category.name} masih dipakai oleh ${category._count.items} item. Pindahkan atau hapus item terlebih dahulu.`,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.itemCategory.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: ENTITY,
      entityId: id,
      before: toDto(category),
    });
  });
}
