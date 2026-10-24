import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}

export function EmptyState({
  title = 'Belum ada data',
  description,
  icon: Icon = Inbox,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Icon className="text-base-content/30 size-12" />
      <p className="font-medium">{title}</p>
      {description && <p className="text-base-content/60 text-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
