import type { ReactNode } from 'react';
import type { Role } from '@sipita/shared';
import { ForbiddenPage } from '@/features/errors/ForbiddenPage';
import { usePermission } from '@/hooks/usePermission';

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { can } = usePermission();
  return can(...roles) ? <>{children}</> : <ForbiddenPage />;
}
