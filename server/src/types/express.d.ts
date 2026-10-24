import type { Role } from '@sipita/shared';

export interface AuthContext {
  id: string;
  roles: Role[];
  approvalLevel: number | null;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      user?: AuthContext;
    }
  }
}
