import type { Request, RequestHandler } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import type { AuthContext } from '../types/express.js';
import { AppError } from '../utils/AppError.js';

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw AppError.unauthorized();

  const payload = verifyAccessToken(header.slice('Bearer '.length));
  req.user = { id: payload.sub, jobLevel: payload.jobLevel, isAdmin: payload.isAdmin };
  next();
};

/** Returns the authenticated user; use in handlers mounted after `authenticate`. */
export function requireUser(req: Request): AuthContext {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
