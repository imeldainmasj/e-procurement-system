import { createHash } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { JOB_LEVELS } from '@sipita/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const accessPayloadSchema = z.object({
  sub: z.string(),
  jobLevel: z.enum(JOB_LEVELS),
  isAdmin: z.boolean(),
});
export type AccessTokenPayload = z.infer<typeof accessPayloadSchema>;

const refreshPayloadSchema = z.object({
  sub: z.string(),
  jti: z.string(),
  exp: z.number(),
});
export type RefreshTokenPayload = z.infer<typeof refreshPayloadSchema>;

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return accessPayloadSchema.parse(jwt.verify(token, env.JWT_ACCESS_SECRET));
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Sesi Anda telah berakhir');
    }
    throw AppError.unauthorized('Token tidak valid');
  }
}

/** `tokenId` becomes the JWT `jti` and the RefreshToken row id. */
export function signRefreshToken(
  userId: string,
  tokenId: string,
): { token: string; expiresAt: Date } {
  const token = jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, {
    jwtid: tokenId,
    expiresIn: env.JWT_REFRESH_EXPIRES as SignOptions['expiresIn'],
  });
  const { exp } = refreshPayloadSchema.parse(jwt.decode(token));
  return { token, expiresAt: new Date(exp * 1000) };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    return refreshPayloadSchema.parse(jwt.verify(token, env.JWT_REFRESH_SECRET));
  } catch {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Sesi tidak valid, silakan login kembali');
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
