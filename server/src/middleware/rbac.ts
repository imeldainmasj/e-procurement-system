import type { RequestHandler } from 'express';
import { hasAnyRole, type Role } from '@sipita/shared';
import { AppError } from '../utils/AppError.js';

/** Allows the request when the user has any of `roles` (SUPER_ADMIN always passes). */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw AppError.unauthorized();
    if (!hasAnyRole(req.user.roles, roles)) throw AppError.forbidden();
    next();
  };
}
