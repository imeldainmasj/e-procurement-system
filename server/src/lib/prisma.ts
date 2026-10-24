import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env, isProduction } from '../config/env.js';

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log: isProduction ? ['error'] : ['warn', 'error'],
    // Never leak password hashes; opt back in explicitly with `select` where needed (login).
    omit: { user: { passwordHash: true } },
  });
}

export type AppPrismaClient = ReturnType<typeof createPrismaClient>;

// Reuse a single client across tsx watch reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: AppPrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (!isProduction) globalForPrisma.prisma = prisma;

/**
 * Client usable both as `prisma` and inside `prisma.$transaction(async (tx) => ...)`,
 * keeping the global `omit`. Mirrors Prisma's interactive-transaction deny list.
 */
export type TxClient = Omit<
  AppPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;
