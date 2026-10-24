import { ROLES, type Role } from '@sipita/shared';
import { signAccessToken } from '../lib/jwt.js';
import { hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';

/** Truncates every application table in the test database. */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export const TEST_PASSWORD = 'Password123!';
let cachedHash: string | undefined;

interface CreateUserOptions {
  email?: string;
  name?: string;
  roles?: Role[];
  approvalLevel?: number | null;
  isActive?: boolean;
  divisionId?: string | null;
}

export async function createTestUser(options: CreateUserOptions = {}) {
  cachedHash ??= await hashPassword(TEST_PASSWORD);
  const roles = options.roles ?? ['REQUESTER'];

  return prisma.user.create({
    data: {
      name: options.name ?? 'Test User',
      email: options.email ?? `user-${crypto.randomUUID()}@test.local`,
      passwordHash: cachedHash,
      approvalLevel: options.approvalLevel ?? null,
      isActive: options.isActive ?? true,
      divisionId: options.divisionId ?? null,
      roles: {
        create: roles.map((code) => ({
          role: { connectOrCreate: { where: { code }, create: { code, name: code } } },
        })),
      },
    },
  });
}

/** Authorization header for a user, signed directly (no login round-trip). */
export function authHeader(user: { id: string; approvalLevel?: number | null }, roles: Role[]) {
  const token = signAccessToken({ sub: user.id, roles, approvalLevel: user.approvalLevel ?? null });
  return { Authorization: `Bearer ${token}` };
}

/** Admin user plus its Authorization header. */
export async function createAdmin() {
  const admin = await createTestUser({
    email: `admin-${crypto.randomUUID()}@test.local`,
    roles: ['SUPER_ADMIN'],
  });
  return { admin, headers: authHeader(admin, ['SUPER_ADMIN']) };
}

/** Make sure every role row exists (services connect roles by code). */
export async function ensureRoles(): Promise<void> {
  for (const code of ROLES) {
    await prisma.role.upsert({ where: { code }, update: {}, create: { code, name: code } });
  }
}

/** The default approval tiers from CLAUDE.md §5. */
export async function seedDefaultApprovalRules(): Promise<void> {
  await prisma.approvalRule.createMany({
    data: [
      {
        name: '< 10jt',
        minAmount: 0,
        minInclusive: true,
        maxAmount: 10_000_000,
        maxInclusive: false,
        levels: [1],
      },
      {
        name: '10–50jt',
        minAmount: 10_000_000,
        minInclusive: true,
        maxAmount: 50_000_000,
        maxInclusive: true,
        levels: [1, 2],
      },
      {
        name: '> 50jt',
        minAmount: 50_000_000,
        minInclusive: false,
        maxAmount: null,
        maxInclusive: false,
        levels: [1, 2, 3],
      },
    ],
  });
}
