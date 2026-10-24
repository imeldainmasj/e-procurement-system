import type {
  ResetPasswordInput,
  Role,
  UserCreatePayload,
  UserDto,
  UserUpdatePayload,
  userListQuerySchema,
} from '@sipita/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { writeAuditLog } from '../../lib/audit.js';
import { hashPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../utils/actor.js';
import { AppError } from '../../utils/AppError.js';
import { iso } from '../../utils/dto.js';
import { buildOrderBy, pageArgs, pageMeta, searchFilter } from '../../utils/pagination.js';

type ListQuery = z.output<typeof userListQuerySchema>;

const ENTITY = 'User';

const userSelect = {
  id: true,
  name: true,
  email: true,
  nip: true,
  phone: true,
  approvalLevel: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  division: { select: { id: true, code: true, name: true } },
  roles: { select: { role: { select: { code: true } } } },
} satisfies Prisma.UserSelect;

type UserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function toDto(u: UserRecord): UserDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    nip: u.nip,
    phone: u.phone,
    approvalLevel: u.approvalLevel,
    isActive: u.isActive,
    lastLoginAt: iso(u.lastLoginAt),
    division: u.division,
    roles: u.roles.map((r) => r.role.code),
    createdAt: iso(u.createdAt),
    updatedAt: iso(u.updatedAt),
  };
}

export async function list(q: ListQuery) {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...searchFilter(q.search, ['name', 'email', 'nip']),
    ...(q.role && { roles: { some: { role: { code: q.role } } } }),
    ...(q.divisionId && { divisionId: q.divisionId }),
    ...(q.isActive !== undefined && { isActive: q.isActive }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: buildOrderBy<Prisma.UserOrderByWithRelationInput>(
        q.sort,
        ['name', 'email', 'nip', 'createdAt', 'lastLoginAt', 'division.name'],
        { name: 'asc' },
      ),
      ...pageArgs(q),
    }),
    prisma.user.count({ where }),
  ]);
  return { data: rows.map(toDto), meta: pageMeta(q, total) };
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

  // Soft-deleted users keep their email/NIP, so the check covers them too.
  if (await prisma.user.findFirst({ where: { email: input.email, ...notCurrent } })) {
    throw AppError.conflict(`Email ${input.email} sudah digunakan`);
  }
  if (input.nip && (await prisma.user.findFirst({ where: { nip: input.nip, ...notCurrent } }))) {
    throw AppError.conflict(`NIP ${input.nip} sudah digunakan`);
  }
  if (input.divisionId) {
    const division = await prisma.division.findFirst({
      where: { id: input.divisionId, deletedAt: null },
    });
    if (!division) throw AppError.badRequest('Divisi tidak ditemukan');
  }
}

const roleLinks = (roles: Role[]) => roles.map((code) => ({ role: { connect: { code } } }));

function userData(input: UserUpdatePayload) {
  return {
    name: input.name,
    email: input.email,
    nip: input.nip,
    phone: input.phone,
    divisionId: input.divisionId,
    approvalLevel: input.approvalLevel,
    isActive: input.isActive,
  };
}

export async function create(input: UserCreatePayload, actor: Actor): Promise<UserDto> {
  await assertValid(input);
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { ...userData(input), passwordHash, roles: { create: roleLinks(input.roles) } },
      select: userSelect,
    });
    await writeAuditLog(tx, {
      actor,
      action: 'CREATE',
      entity: ENTITY,
      entityId: created.id,
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
    if (
      before.roles.some((r) => r.role.code === 'SUPER_ADMIN') &&
      !input.roles.includes('SUPER_ADMIN')
    ) {
      throw AppError.badRequest('Anda tidak dapat menghapus role Super Admin dari akun sendiri');
    }
  }

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { ...userData(input), roles: { deleteMany: {}, create: roleLinks(input.roles) } },
      select: userSelect,
    });
    // Deactivation ends all sessions immediately; role changes apply on the next token refresh.
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
    await tx.division.updateMany({ where: { headUserId: id }, data: { headUserId: null } });
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
