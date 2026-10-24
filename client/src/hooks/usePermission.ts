import { useCallback, useMemo } from 'react';
import {
  canAccess,
  isManager,
  toPermissionMap,
  type AccessSubject,
  type Feature,
  type PermissionAction,
} from '@sipita/shared';
import { useAuthStore } from '@/stores/authStore';

const SIGNED_OUT: AccessSubject = {
  jobLevel: 'STAFF',
  isAdmin: false,
  permissions: toPermissionMap([]),
};

/**
 * Client-side mirror of the server's access rules (CLAUDE.md §4), used only to hide UI;
 * the server checks every request again.
 */
export function usePermission() {
  const user = useAuthStore((s) => s.user);
  const subject = useMemo<AccessSubject>(() => user ?? SIGNED_OUT, [user]);

  const can = useCallback(
    (feature: Feature, action: PermissionAction = 'view') =>
      user ? canAccess(subject, feature, action) : false,
    [user, subject],
  );

  return {
    user,
    subject,
    can,
    isAdmin: Boolean(user?.isAdmin),
    isManager: user ? isManager(user.jobLevel) : false,
  };
}
