import type { ReactNode } from 'react';
import { hasNavAccess, type NavAccess } from '@/config/navigation';
import { ForbiddenPage } from '@/features/errors/ForbiddenPage';
import { usePermission } from '@/hooks/usePermission';

export function RequireAccess({ access, children }: { access: NavAccess; children: ReactNode }) {
  const { user, subject } = usePermission();
  return user && hasNavAccess(subject, access) ? <>{children}</> : <ForbiddenPage />;
}
