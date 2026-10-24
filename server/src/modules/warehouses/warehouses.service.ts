import type { WarehouseDto, WarehousePayload, warehouseListQuerySchema } from '@sipita/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { buildOrderBy, pageArgs, pageMeta, searchFilter } from '../../utils/pagination.js';

type ListQuery = z.output<typeof warehouseListQuerySchema>;

const ENTITY = 'Warehouse';

type WarehouseRecord = Prisma.WarehouseGetPayload<object>;

function toDto(w: WarehouseRecord): WarehouseDto {
  return {
    id: w.id,
    code: w.code,
    name: w.name,
    location: w.location,
    isActive: w.isActive,
    createdAt: iso(w.createdAt),
    updatedAt: iso(w.updatedAt),
  };
}

export async function list(q: ListQuery) {
  const where: Prisma.WarehouseWhereInput = {
    deletedAt: null,
    ...searchFilter(q.search, ['code', 'name', 'location']),
    ...(q.isActive !== undefined && { isActive: q.isActive }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.warehouse.findMany({
      where,
      orderBy: buildOrderBy<Prisma.WarehouseOrderByWithRelationInput>(
        q.sort,
        ['code', 'name', 'location', 'createdAt'],
        { code: 'asc' },
      ),
      ...pageArgs(q),
    }),
    prisma.warehouse.count({ where }),
  ]);
  return { data: rows.map(toDto), meta: pageMeta(q, total) };
}

async function findOrThrow(id: string): Promise<WarehouseRecord> {
  const warehouse = await prisma.warehouse.findFirst({ where: { id, deletedAt: null } });
  if (!warehouse) throw AppError.notFound('Gudang tidak ditemukan');
  return warehouse;
}

export async function get(id: string): Promise<WarehouseDto> {
  return toDto(await findOrThrow(id));
}

async function assertCodeAvailable(code: string, currentId?: string): Promise<void> {
  const existing = await prisma.warehouse.findFirst({
    where: { code, NOT: currentId ? { id: currentId } : undefined },
  });
  if (existing) throw AppError.conflict(`Kode gudang ${code} sudah digunakan`);
}

export async function create(input: WarehousePayload, actor: Actor): Promise<WarehouseDto> {
  await assertCodeAvailable(input.code);
  const warehouse = await prisma.$transaction(async (tx) => {
    const created = await tx.warehouse.create({ data: input });
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: ENTITY,
      entityId: created.id,
      after: created,
    });
    return created;
  });
  return toDto(warehouse);
}

export async function update(
  id: string,
  input: WarehousePayload,
  actor: Actor,
): Promise<WarehouseDto> {
  const before = await findOrThrow(id);
  await assertCodeAvailable(input.code, id);
  const warehouse = await prisma.$transaction(async (tx) => {
    const updated = await tx.warehouse.update({ where: { id }, data: input });
    await writeAuditLog(tx, {
      actor,
      action: before.isActive !== input.isActive ? 'STATUS_CHANGE' : 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before,
      after: updated,
    });
    return updated;
  });
  return toDto(warehouse);
}

// A stock-balance check is added here with the warehouse module (stage 8).
export async function remove(id: string, actor: Actor): Promise<void> {
  const warehouse = await findOrThrow(id);
  await prisma.$transaction(async (tx) => {
    await tx.warehouse.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: ENTITY,
      entityId: id,
      before: warehouse,
    });
  });
}
