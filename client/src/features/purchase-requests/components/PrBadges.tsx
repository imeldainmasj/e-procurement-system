import {
  PR_PRIORITY_LABELS,
  PR_STATUS_LABELS,
  type PrPriority,
  type PrStatus,
} from '@sipita/shared';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/utils/cn';

export function PrStatusBadge({ status, className }: { status: PrStatus; className?: string }) {
  return (
    <StatusBadge
      status={status}
      label={PR_STATUS_LABELS[status]}
      {...(className && { className })}
    />
  );
}

const priorityClass: Record<PrPriority, string> = {
  LOW: 'badge-ghost',
  MEDIUM: 'badge-neutral badge-outline',
  HIGH: 'badge-warning badge-outline',
  URGENT: 'badge-error',
};

export function PriorityBadge({ priority }: { priority: PrPriority }) {
  return (
    <span className={cn('badge badge-sm whitespace-nowrap', priorityClass[priority])}>
      {PR_PRIORITY_LABELS[priority]}
    </span>
  );
}
