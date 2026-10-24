import type { Request } from 'express';
import type { Role } from '@sipita/shared';
import { requireUser } from '../middleware/auth.js';

/** Who performs an action; passed from controllers to services for permission checks and audit logging. */
export interface Actor {
  userId: string;
  roles: Role[];
  ip: string | null;
}

export function getActor(req: Request): Actor {
  const user = requireUser(req);
  return { userId: user.id, roles: user.roles, ip: req.ip ?? null };
}
