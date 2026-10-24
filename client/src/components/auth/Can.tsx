import type { ReactNode } from 'react';
import type { Feature, PermissionAction } from '@sipita/shared';
import { usePermission } from '@/hooks/usePermission';

type CanProps = {
  children: ReactNode;
  fallback?: ReactNode;
} & ({ feature: Feature; action?: PermissionAction } | { admin: true });

/** Hides UI the user may not use; the server still enforces every rule. */
export function Can({ children, fallback = null, ...rule }: CanProps) {
  const { can, isAdmin } = usePermission();
  const allowed = 'admin' in rule ? isAdmin : can(rule.feature, rule.action ?? 'view');
  return <>{allowed ? children : fallback}</>;
}
