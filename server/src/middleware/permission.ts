import type { RequestHandler } from 'express';
import {
  canAccess,
  toPermissionMap,
  type Feature,
  type PermissionAction,
  type PermissionMap,
} from '@sipita/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { requireUser } from './auth.js';

export async function loadPermissions(userId: string): Promise<PermissionMap> {
  const rows = await prisma.userPermission.findMany({
    where: { userId },
    select: { feature: true, canView: true, canCreate: true, canUpdate: true, canDelete: true },
  });
  return toPermissionMap(rows);
}

/**
 * Job level + `UserPermission` check (CLAUDE.md §4). Permissions are read from the database
 * on each request so a change by an admin applies immediately, not after the token expires.
 * Ownership (staff only change their own works) is checked in the services.
 */
export function requirePermission(feature: Feature, action: PermissionAction): RequestHandler {
  return async (req, _res, next) => {
    const user = requireUser(req);
    if (!user.isAdmin) {
      req.permissions ??= await loadPermissions(user.id);
      if (!canAccess({ ...user, permissions: req.permissions }, feature, action)) {
        throw AppError.forbidden();
      }
    }
    next();
  };
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!requireUser(req).isAdmin) throw AppError.forbidden();
  next();
};
