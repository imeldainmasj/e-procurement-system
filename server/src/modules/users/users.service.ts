import {
  FEATURES,
  toPermissionMap,
  type PermissionMap,
  type ResetPasswordInput,
  type UserCreatePayload,
  type UserDto,
  type UserOptionDto,
  type UserUpdatePayload,
  type userListQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { hashPassword } from '../../lib/password.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { buildOrderBy, pageArgs, pageMeta, searchFilter } from '../../utils/pagination.js';

type ListQuery = z.output<typeof userListQuerySchema>;

const ENTITY = 'User';

const userSelect = {
  id: true,
  employeeId: true,
  username: true,
  name: true,
  email: true,
  jobLevel: true,
  isAdmin: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, code: true, name: true } },
  permissions: {
    select: { feature: true, canView: true, canCreate: true, canUpdate: true, canDelete: true },
  },
} satisfies Prisma.UserSelect;

type UserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function toDto(u: UserRecord): UserDto {
  return {
    id: u.id,
    employeeId: u.employeeId,
    username: u.username,
    name: u.name,
    email: u.email,
    jobLevel: u.jobLevel,
    isAdmin: u.isAdmin,
    isActive: u.isActive,
    lastLoginAt: iso(u.lastLoginAt),
    department: u.department,
    permissions: toPermissionMap(u.permissions),
    createdAt: iso(u.createdAt),
    updatedAt: iso(u.updatedAt),
  };
}

export async function list(q: ListQuery) {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...searchFilter(q.search, ['name', 'email', 'username', 'employeeId']),
    ...(q.jobLevel && { jobLevel: q.jobLevel }),
    ...(q.departmentId && { departmentId: q.departmentId }),
    ...(q.isActive !== undefined && { isActive: q.isActive }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: buildOrderBy<Prisma.UserOrderByWithRelationInput>(
        q.sort,
        ['name', 'username', 'email', 'employeeId', 'jobLevel', 'createdAt', 'lastLoginAt'],
        { name: 'asc' },
      ),
      ...pageArgs(q),
    }),
    prisma.user.count({ where }),
  ]);
  return { data: rows.map(toDto), meta: pageMeta(q, total) };
}

/** Active users for pickers (PIC, filters); readable by every signed-in user. */
export async function options(): Promise<UserOptionDto[]> {
  return prisma.user.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true, username: true, jobLevel: true },
    orderBy: { name: 'asc' },
  });
}

async function findOrThrow(id: string): Promise<UserRecord> {
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
  if (!user) throw AppError.notFound('Pengguna tidak ditemukan');
  return user;
}

export async function get(id: string): Promise<UserDto> {
  return toDto(await findOrThrow(id));
}

async function assertValid(input: UserUpdatePayload, currentId?: string): Promise<void> {
  const notCurrent = currentId ? { NOT: { id: currentId } } : {};

  // Soft-deleted users keep their identifiers, so the checks cover them too.
  const unique: [keyof Prisma.UserWhereInput, string, string][] = [
    ['email', input.email, 'Email'],
    ['username', input.username, 'Username'],
    ['employeeId', input.employeeId, 'NIK karyawan'],
  ];
  for (const [field, value, label] of unique) {
    if (await prisma.user.findFirst({ where: { [field]: value, ...notCurrent } })) {
      throw AppError.conflict(`${label} ${value} sudah digunakan`);
    }
  }
  if (input.departmentId) {
    const department = await prisma.department.findFirst({
      where: { id: input.departmentId, deletedAt: null },
    });
    if (!department) throw AppError.badRequest('Departemen tidak ditemukan');
  }
}

function userData(input: UserUpdatePayload) {
  return {
    employeeId: input.employeeId,
    username: input.username,
    name: input.name,
    email: input.email,
    jobLevel: input.jobLevel,
    departmentId: input.departmentId,
    isAdmin: input.isAdmin,
    isActive: input.isActive,
  };
}

async function savePermissions(tx: TxClient, userId: string, map: PermissionMap): Promise<void> {
  for (const feature of FEATURES) {
    const flags = map[feature];
    const data = {
      canView: flags.view,
      canCreate: flags.create,
      canUpdate: flags.update,
      canDelete: flags.delete,
    };
    await tx.userPermission.upsert({
      where: { userId_feature: { userId, feature } },
      update: data,
      create: { userId, feature, ...data },
    });
  }
}

export async function create(input: UserCreatePayload, actor: Actor): Promise<UserDto> {
  await assertValid(input);
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const { id } = await tx.user.create({ data: { ...userData(input), passwordHash } });
    await savePermissions(tx, id, input.permissions);
    const created = await tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: ENTITY,
      entityId: id,
      after: toDto(created),
    });
    return created;
  });
  return toDto(user);
}

export async function update(id: string, input: UserUpdatePayload, actor: Actor): Promise<UserDto> {
  const before = await findOrThrow(id);
  await assertValid(input, id);

  if (id === actor.userId) {
    if (!input.isActive) throw AppError.badRequest('Anda tidak dapat menonaktifkan akun sendiri');
    if (before.isAdmin && !input.isAdmin) {
      throw AppError.badRequest('Anda tidak dapat mencabut hak admin dari akun sendiri');
    }
  }

  const user = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: userData(input) });
    await savePermissions(tx, id, input.permissions);
    const updated = await tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
    // Deactivation ends all sessions immediately; permission changes apply on the next
    // request, job level and admin changes on the next token refresh.
    if (before.isActive && !input.isActive) {
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await writeAuditLog(tx, {
      actor,
      action: before.isActive !== input.isActive ? 'STATUS_CHANGE' : 'UPDATE',
      entity: ENTITY,
      entityId: id,
      before: toDto(before),
      after: toDto(updated),
    });
    return updated;
  });
  return toDto(user);
}

export async function resetPassword(
  id: string,
  input: ResetPasswordInput,
  actor: Actor,
): Promise<void> {
  await findOrThrow(id);
  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash } });
    await tx.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAuditLog(tx, { actor, action: 'RESET_PASSWORD', entity: ENTITY, entityId: id });
  });
}

export async function remove(id: string, actor: Actor): Promise<void> {
  if (id === actor.userId) throw AppError.badRequest('Anda tidak dapat menghapus akun sendiri');
  const user = await findOrThrow(id);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await tx.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAuditLog(tx, {
      actor,
      action: 'DELETE',
      entity: ENTITY,
      entityId: id,
      before: toDto(user),
    });
  });
}
