import type { JobLevel, PermissionMap } from '@sipita/shared';

export interface AuthContext {
  id: string;
  jobLevel: JobLevel;
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      user?: AuthContext;
      /** Loaded once per request by `requirePermission`. */
      permissions?: PermissionMap;
    }
  }
}
