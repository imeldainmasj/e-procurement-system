import { useCallback } from 'react';
import { hasAnyRole, type Role } from '@sipita/shared';
import { useAuthStore } from '@/stores/authStore';

export function usePermission() {
  const roles = useAuthStore((s) => s.user?.roles);

  const can = useCallback(
    (...required: Role[]) => (roles ? hasAnyRole(roles, required) : false),
    [roles],
  );

  return { roles: roles ?? [], can };
}
