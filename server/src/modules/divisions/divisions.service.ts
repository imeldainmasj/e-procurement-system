import type { DivisionDto, DivisionPayload, divisionListQuerySchema } from '@sipita/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { buildOrderBy, pageArgs, pageMeta, searchFilter } from '../../utils/pagination.js';

type ListQuery = z.output<typeof divisionListQuerySchema>;

const ENTITY = 'Division';

const divisionSelect = {
  id: true,
  code: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  headUser: { select: { id: true, name: true } },
  _count: { select: { users: { where: { deletedAt: null } } } },
} satisfies Prisma.DivisionSelect;

type DivisionRecord = Prisma.DivisionGetPayload<{ select: typeof divisionSelect }>;

function toDto(d: DivisionRecord): DivisionDto {
  return {
    id: d.id,
    code: d.code,
    name: d.name,
    headUser: d.headUser,
    userCount: d._count.users,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export async function list(q: ListQuery) {
  const where: Prisma.DivisionWhereInput = {
    deletedAt: null,
    ...searchFilter(q.search, ['code', 'name']),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.division.findMany({
      where,
      select: divisionSelect,
      orderBy: buildOrderBy<Prisma.DivisionOrderByWithRelationInput>(
        q.sort,
        ['code', 'name', 'createdAt'],
        { code: 'asc' },
      ),
      ...pageArgs(q),
    }),
    prisma.division.count({ where }),
  ]);
  return { data: rows.map(toDto), meta: pageMeta(q, total) };
}

async function findOrThrow(id: string): Promise<DivisionRecord> {
  const division = await prisma.division.findFirst({
    where: { id, deletedAt: null },
    select: divisionSelect,
  });
  if (!division) throw AppError.notFound('Divisi tidak ditemukan');
  return division;
}

export async function get(id: string): Promise<DivisionDto> {
  return toDto(await findOrThrow(id));
}

async function assertValid(input: DivisionPayload, currentId?: string): Promise<void> {
  const sameCode = await prisma.division.findFirst({
    where: { code: input.code, NOT: currentId ? { id: currentId } : undefined },
  });
  if (sameCode) throw AppError.conflict(`Kode divisi ${input.code} sudah digunakan`);

  if (input.headUserId) {
    const head = await prisma.user.findFirst({
      where: { id: input.headUserId, deletedAt: null, isActive: true },
      select: { id: true, headOf: { select: { id: true, name: true } } },
    });
    if (!head) throw AppError.badRequest('Kepala divisi tidak ditemukan atau tidak aktif');
    if (head.headOf && head.headOf.id !== currentId) {
      throw AppError.conflict(`Pengguna tersebut sudah menjadi kepala divisi ${head.headOf.name}`);
    }
  }
}

export async function create(input: DivisionPayload, actor: Actor): Promise<DivisionDto> {
  await assertValid(input);
  const division = await prisma.$transaction(async (tx) => {
    const created = await tx.division.create({ data: input, select: divisionSelect });
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: ENTITY,
      entityId: created.id,
      after: input,
    });
    return created;
  });
  return toDto(division);
}

export async function update(
  id: string,
  input: DivisionPayload,
  actor: Actor,
): Promise<DivisionDto> {
  const before = await findOrThrow(id);
  await assertValid(input, id);
  const division = await prisma.$transaction(async (tx) => {
    const updated = await tx.division.update({
      where: { id },
      data: input,
      select: divisionSelect,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before: { code: before.code, name: before.name, headUserId: before.headUser?.id ?? null },
      after: input,
    });
    return updated;
  });
  return toDto(division);
}

export async function remove(id: string, actor: Actor): Promise<void> {
  const division = await findOrThrow(id);
  if (division._count.users > 0) {
    throw AppError.conflict(
      `Divisi ${division.name} masih memiliki ${division._count.users} pengguna. Pindahkan pengguna terlebih dahulu.`,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.division.update({ where: { id }, data: { deletedAt: new Date(), headUserId: null } });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: ENTITY,
      entityId: id,
      before: toDto(division),
    });
  });
}
