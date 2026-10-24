import {
  AGREEMENT_STATUS_LABELS,
  IMPORT_STATUS_LABELS,
  MILESTONE_STATUS_LABELS,
  PVP_STATUS_LABELS,
  WORK_STATUS_LABELS,
  type AgreementStatus,
  type ImportStatus,
  type MilestoneStatus,
  type PvpStatus,
  type WorkStatus,
} from '@sipita/shared';
import { cn } from '@/utils/cn';

/**
 * Colours per status (CLAUDE.md §9), rendered as Velzon-style soft badges:
 * not started → ghost, in progress / on hold / expiring → warning, done / active /
 * completed → success, expired / cancelled / rejected → error, N/A → dimmed ghost.
 */
const TONE: Record<string, string> = {
  NOT_STARTED: 'badge-ghost',
  IN_PROGRESS: 'badge-warning',
  DONE: 'badge-success',
  NOT_APPLICABLE: 'badge-ghost opacity-60',
  ACTIVE: 'badge-success',
  ON_HOLD: 'badge-warning',
  COMPLETED: 'badge-success',
  CANCELLED: 'badge-error',
  EXPIRING_SOON: 'badge-warning',
  EXPIRED: 'badge-error',
  TERMINATED: 'badge-error',
  PENDING: 'badge-warning',
  APPROVED: 'badge-success',
  REJECTED: 'badge-error',
  PREVIEW: 'badge-warning',
  COMMITTED: 'badge-success',
  ROLLED_BACK: 'badge-ghost',
  FAILED: 'badge-error',
  INACTIVE: 'badge-ghost',
};

type Kind = 'work' | 'milestone' | 'agreement' | 'pvp' | 'import';

const LABELS: Record<Kind, Record<string, string>> = {
  work: WORK_STATUS_LABELS satisfies Record<WorkStatus, string>,
  milestone: MILESTONE_STATUS_LABELS satisfies Record<MilestoneStatus, string>,
  agreement: AGREEMENT_STATUS_LABELS satisfies Record<AgreementStatus, string>,
  pvp: PVP_STATUS_LABELS satisfies Record<PvpStatus, string>,
  import: IMPORT_STATUS_LABELS satisfies Record<ImportStatus, string>,
};

interface StatusBadgeProps {
  status: string;
  /** Which label set to use; statuses such as ACTIVE mean different things per entity. */
  kind?: Kind;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, kind, label, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'badge badge-sm badge-soft whitespace-nowrap',
        TONE[status] ?? 'badge-ghost',
        className,
      )}
    >
      {label ?? (kind && LABELS[kind][status]) ?? status}
    </span>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <StatusBadge status={active ? 'ACTIVE' : 'INACTIVE'} label={active ? 'Aktif' : 'Nonaktif'} />
  );
}
