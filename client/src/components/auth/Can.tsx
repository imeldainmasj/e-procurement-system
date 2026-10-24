import type { ReactNode } from 'react';
import type { Role } from '@sipita/shared';
import { usePermission } from '@/hooks/usePermission';

interface CanProps {
  /** One role or a list; the user needs any of them (SUPER_ADMIN always passes). */
  role: Role | Role[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function Can({ role, children, fallback = null }: CanProps) {
  const { can } = usePermission();
  const roles = Array.isArray(role) ? role : [role];
  return <>{can(...roles) ? children : fallback}</>;
}
