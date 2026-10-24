import type {
  DepartmentDto,
  DepartmentPayload,
  DirectorateDto,
  DirectoratePayload,
  DivisionDto,
  DivisionPayload,
  organizationListQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { buildOrderBy, pageArgs, pageMeta, searchFilter } from '../../utils/pagination.js';

type ListQuery = z.output<typeof organizationListQuerySchema>;

const SORTABLE = ['code', 'name', 'createdAt'] as const;
const active = { deletedAt: null };
const unitRef = { select: { id: true, code: true, name: true } } as const;

const stamps = (u: { createdAt: Date; updatedAt: Date }) => ({
  createdAt: iso(u.createdAt),
  updatedAt: iso(u.updatedAt),
});

/** Codes stay reserved after a soft delete, so the lookup includes deleted rows. */
function assertCodeFree(found: { id: string } | null, label: string, code: string): void {
  if (found) throw AppError.conflict(`Kode ${label} ${code} sudah digunakan`);
}

const notId = (id?: string) => (id ? { NOT: { id } } : {});

// ─── Directorate ─────────────────────────────────────────────────────────────

const directorateSelect = {
  id: true,
  code: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { divisions: { where: active } } },
} satisfies Prisma.DirectorateSelect;

function toDirectorateDto(
  d: Prisma.DirectorateGetPayload<{ select: typeof directorateSelect }>,
): DirectorateDto {
  return { id: d.id, code: d.code, name: d.name, divisionCount: d._count.divisions, ...stamps(d) };
}

export async function listDirectorates(q: ListQuery) {
  const where = { ...active, ...searchFilter(q.search, ['code', 'name']) };
  const [rows, total] = await prisma.$transaction([
    prisma.directorate.findMany({
      where,
      select: directorateSelect,
      orderBy: buildOrderBy<Prisma.DirectorateOrderByWithRelationInput>(q.sort, SORTABLE, {
        code: 'asc',
      }),
      ...pageArgs(q),
    }),
    prisma.directorate.count({ where }),
  ]);
  return { data: rows.map(toDirectorateDto), meta: pageMeta(q, total) };
}

async function findDirectorate(id: string) {
  const row = await prisma.directorate.findFirst({
    where: { id, ...active },
    select: directorateSelect,
  });
  if (!row) throw AppError.notFound('Direktorat tidak ditemukan');
  return row;
}

export async function saveDirectorate(
  id: string | undefined,
  input: DirectoratePayload,
  actor: Actor,
): Promise<DirectorateDto> {
  const before = id ? await findDirectorate(id) : null;
  assertCodeFree(
    await prisma.directorate.findFirst({ where: { code: input.code, ...notId(id) } }),
    'direktorat',
    input.code,
  );
  return prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.directorate.update({ where: { id }, data: input, select: directorateSelect })
      : await tx.directorate.create({ data: input, select: directorateSelect });
    const dto = toDirectorateDto(saved);
    await writeAuditLog(tx, {
      actor,
      action: id ? 'UPDATE' : 'CREATE',
      entity: 'Directorate',
      entityId: saved.id,
      before: before && toDirectorateDto(before),
      after: dto,
    });
    return dto;
  });
}

export async function removeDirectorate(id: string, actor: Actor): Promise<void> {
  const row = await findDirectorate(id);
  if (row._count.divisions > 0) {
    throw AppError.badRequest('Direktorat masih memiliki divisi aktif');
  }
  await prisma.$transaction(async (tx) => {
    await tx.directorate.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: 'Directorate',
      entityId: id,
      before: toDirectorateDto(row),
    });
  });
}

// ─── Division ────────────────────────────────────────────────────────────────

const divisionSelect = {
  id: true,
  code: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  directorate: unitRef,
  _count: { select: { departments: { where: active } } },
} satisfies Prisma.DivisionSelect;

function toDivisionDto(
  d: Prisma.DivisionGetPayload<{ select: typeof divisionSelect }>,
): DivisionDto {
  return {
    id: d.id,
    code: d.code,
    name: d.name,
    directorate: d.directorate,
    departmentCount: d._count.departments,
    ...stamps(d),
  };
}

export async function listDivisions(q: ListQuery & { directorateId?: string }) {
  const where: Prisma.DivisionWhereInput = {
    ...active,
    ...searchFilter(q.search, ['code', 'name']),
    ...(q.directorateId && { directorateId: q.directorateId }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.division.findMany({
      where,
      select: divisionSelect,
      orderBy: buildOrderBy<Prisma.DivisionOrderByWithRelationInput>(
        q.sort,
        [...SORTABLE, 'directorate.name'],
        { code: 'asc' },
      ),
      ...pageArgs(q),
    }),
    prisma.division.count({ where }),
  ]);
  return { data: rows.map(toDivisionDto), meta: pageMeta(q, total) };
}

async function findDivision(id: string) {
  const row = await prisma.division.findFirst({ where: { id, ...active }, select: divisionSelect });
  if (!row) throw AppError.notFound('Divisi tidak ditemukan');
  return row;
}

export async function saveDivision(
  id: string | undefined,
  input: DivisionPayload,
  actor: Actor,
): Promise<DivisionDto> {
  const before = id ? await findDivision(id) : null;
  assertCodeFree(
    await prisma.division.findFirst({ where: { code: input.code, ...notId(id) } }),
    'divisi',
    input.code,
  );
  await findDirectorate(input.directorateId);
  return prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.division.update({ where: { id }, data: input, select: divisionSelect })
      : await tx.division.create({ data: input, select: divisionSelect });
    const dto = toDivisionDto(saved);
    await writeAuditLog(tx, {
      actor,
      action: id ? 'UPDATE' : 'CREATE',
      entity: 'Division',
      entityId: saved.id,
      before: before && toDivisionDto(before),
      after: dto,
    });
    return dto;
  });
}

export async function removeDivision(id: string, actor: Actor): Promise<void> {
  const row = await findDivision(id);
  if (row._count.departments > 0) {
    throw AppError.badRequest('Divisi masih memiliki departemen aktif');
  }
  await prisma.$transaction(async (tx) => {
    await tx.division.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: 'Division',
      entityId: id,
      before: toDivisionDto(row),
    });
  });
}

// ─── Department ──────────────────────────────────────────────────────────────

const departmentSelect = {
  id: true,
  code: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  division: { select: { id: true, code: true, name: true, directorate: unitRef } },
  _count: { select: { users: { where: active } } },
} satisfies Prisma.DepartmentSelect;

function toDepartmentDto(
  d: Prisma.DepartmentGetPayload<{ select: typeof departmentSelect }>,
): DepartmentDto {
  const { directorate, ...division } = d.division;
  return {
    id: d.id,
    code: d.code,
    name: d.name,
    division,
    directorate,
    userCount: d._count.users,
    ...stamps(d),
  };
}

export async function listDepartments(q: ListQuery & { divisionId?: string }) {
  const where: Prisma.DepartmentWhereInput = {
    ...active,
    ...searchFilter(q.search, ['code', 'name']),
    ...(q.divisionId && { divisionId: q.divisionId }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.department.findMany({
      where,
      select: departmentSelect,
      orderBy: buildOrderBy<Prisma.DepartmentOrderByWithRelationInput>(
        q.sort,
        [...SORTABLE, 'division.name'],
        { code: 'asc' },
      ),
      ...pageArgs(q),
    }),
    prisma.department.count({ where }),
  ]);
  return { data: rows.map(toDepartmentDto), meta: pageMeta(q, total) };
}

async function findDepartment(id: string) {
  const row = await prisma.department.findFirst({
    where: { id, ...active },
    select: departmentSelect,
  });
  if (!row) throw AppError.notFound('Departemen tidak ditemukan');
  return row;
}

export async function saveDepartment(
  id: string | undefined,
  input: DepartmentPayload,
  actor: Actor,
): Promise<DepartmentDto> {
  const before = id ? await findDepartment(id) : null;
  assertCodeFree(
    await prisma.department.findFirst({ where: { code: input.code, ...notId(id) } }),
    'departemen',
    input.code,
  );
  await findDivision(input.divisionId);
  return prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.department.update({ where: { id }, data: input, select: departmentSelect })
      : await tx.department.create({ data: input, select: departmentSelect });
    const dto = toDepartmentDto(saved);
    await writeAuditLog(tx, {
      actor,
      action: id ? 'UPDATE' : 'CREATE',
      entity: 'Department',
      entityId: saved.id,
      before: before && toDepartmentDto(before),
      after: dto,
    });
    return dto;
  });
}

export async function removeDepartment(id: string, actor: Actor): Promise<void> {
  const row = await findDepartment(id);
  if (row._count.users > 0) throw AppError.badRequest('Departemen masih memiliki pengguna aktif');
  await prisma.$transaction(async (tx) => {
    await tx.department.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: 'Department',
      entityId: id,
      before: toDepartmentDto(row),
    });
  });
}
