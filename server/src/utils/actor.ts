import type { Request } from 'express';
import type { JobLevel } from '@sipita/shared';
import { requireUser } from '../middleware/auth.js';

/** Who performs an action; passed from controllers to services for ownership checks and audit logging. */
export interface Actor {
  userId: string;
  jobLevel: JobLevel;
  isAdmin: boolean;
  ip: string | null;
}

export function getActor(req: Request): Actor {
  const user = requireUser(req);
  return { userId: user.id, jobLevel: user.jobLevel, isAdmin: user.isAdmin, ip: req.ip ?? null };
}
