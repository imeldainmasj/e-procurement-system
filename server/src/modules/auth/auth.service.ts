import { randomUUID } from 'node:crypto';
import type { AuthSession, AuthUser, LoginInput } from '@sipita/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import { logger } from '../../lib/logger.js';
import { verifyPassword } from '../../lib/password.js';
import { prisma, type TxClient } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';

/**
 * A rotated refresh token presented again within this window is treated as a benign
 * race (e.g. two tabs refreshing at once) rather than token theft.
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;

const authUserSelect = {
  id: true,
  name: true,
  email: true,
  nip: true,
  phone: true,
  approvalLevel: true,
  isActive: true,
  division: { select: { id: true, code: true, name: true } },
  roles: { select: { role: { select: { code: true } } } },
} satisfies Prisma.UserSelect;

type AuthUserRecord = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;

export interface IssuedSession {
  session: AuthSession;
  refreshToken: string;
  refreshExpiresAt: Date;
}

function toAuthUser(user: AuthUserRecord): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    nip: user.nip,
    phone: user.phone,
    approvalLevel: user.approvalLevel,
    division: user.division,
    roles: user.roles.map((r) => r.role.code),
  };
}

async function issueSession(user: AuthUserRecord, tx: TxClient = prisma): Promise<IssuedSession> {
  const authUser = toAuthUser(user);
  const accessToken = signAccessToken({
    sub: authUser.id,
    roles: authUser.roles,
    approvalLevel: authUser.approvalLevel,
  });

  const tokenId = randomUUID();
  const { token, expiresAt } = signRefreshToken(authUser.id, tokenId);
  await tx.refreshToken.create({
    data: { id: tokenId, userId: authUser.id, tokenHash: hashToken(token), expiresAt },
  });

  return {
    session: { accessToken, user: authUser },
    refreshToken: token,
    refreshExpiresAt: expiresAt,
  };
}

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email atau password salah');
const invalidRefresh = () =>
  new AppError(401, 'INVALID_REFRESH_TOKEN', 'Sesi tidak valid, silakan login kembali');

export async function login(input: LoginInput): Promise<IssuedSession> {
  const user = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
    select: { ...authUserSelect, passwordHash: true },
  });

  // Always run bcrypt, even for unknown emails, to keep timing uniform.
  const passwordOk = await verifyPassword(input.password, user?.passwordHash);
  if (!user || !passwordOk) throw invalidCredentials();
  if (!user.isActive) throw new AppError(403, 'ACCOUNT_INACTIVE', 'Akun Anda dinonaktifkan');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return issueSession(user);
}

/** Rotates the refresh token: the presented token is revoked and a new pair is issued. */
export async function refresh(rawToken: string | undefined): Promise<IssuedSession> {
  if (!rawToken) throw invalidRefresh();
  const payload = verifyRefreshToken(rawToken);

  const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
  if (!stored || stored.userId !== payload.sub || stored.tokenHash !== hashToken(rawToken)) {
    throw invalidRefresh();
  }

  if (stored.revokedAt) {
    if (Date.now() - stored.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
      // A long-revoked token being replayed suggests theft: end every session of this user.
      logger.warn({ userId: stored.userId }, 'Refresh token reuse detected; revoking all sessions');
      await revokeAllForUser(stored.userId);
    }
    throw invalidRefresh();
  }
  if (stored.expiresAt <= new Date()) throw invalidRefresh();

  return prisma.$transaction(async (tx) => {
    // Conditional update guards against two concurrent refreshes with the same token.
    const { count } = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw invalidRefresh();

    const user = await tx.user.findFirst({
      where: { id: stored.userId, deletedAt: null },
      select: authUserSelect,
    });
    if (!user) throw invalidRefresh();
    if (!user.isActive) throw new AppError(403, 'ACCOUNT_INACTIVE', 'Akun Anda dinonaktifkan');

    return issueSession(user, tx);
  });
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, isActive: true },
    select: authUserSelect,
  });
  if (!user) throw AppError.unauthorized();
  return toAuthUser(user);
}
