import { FEATURES, type Feature, type JobLevel, type PermissionFlags } from '@sipita/shared';
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
  username?: string;
  email?: string;
  name?: string;
  jobLevel?: JobLevel;
  isAdmin?: boolean;
  isActive?: boolean;
  departmentId?: string | null;
  /** Per-feature overrides; every other feature gets full access. */
  permissions?: Partial<Record<Feature, Partial<PermissionFlags>>>;
}

export async function createTestUser(options: CreateUserOptions = {}) {
  cachedHash ??= await hashPassword(TEST_PASSWORD);
  const key = crypto.randomUUID().slice(0, 8);

  return prisma.user.create({
    data: {
      employeeId: `EMP-${key}`,
      username: options.username ?? `user.${key}`,
      name: options.name ?? 'Test User',
      email: options.email ?? `user-${key}@test.local`,
      passwordHash: cachedHash,
      jobLevel: options.jobLevel ?? 'STAFF',
      isAdmin: options.isAdmin ?? false,
      isActive: options.isActive ?? true,
      departmentId: options.departmentId ?? null,
      permissions: {
        create: FEATURES.map((feature) => {
          const o = options.permissions?.[feature] ?? {};
          return {
            feature,
            canView: o.view ?? true,
            canCreate: o.create ?? true,
            canUpdate: o.update ?? true,
            canDelete: o.delete ?? true,
          };
        }),
      },
    },
  });
}

/** Authorization header for a user, signed directly (no login round-trip). */
export function authHeader(user: { id: string; jobLevel: JobLevel; isAdmin: boolean }) {
  const token = signAccessToken({ sub: user.id, jobLevel: user.jobLevel, isAdmin: user.isAdmin });
  return { Authorization: `Bearer ${token}` };
}

/** Admin user plus its Authorization header. */
export async function createAdmin() {
  const admin = await createTestUser({ isAdmin: true });
  return { admin, headers: authHeader(admin) };
}
