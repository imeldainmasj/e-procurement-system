import { cn } from '@/utils/cn';

/** Colour + Indonesian label per status (CLAUDE.md §8). Unknown statuses fall back to a ghost badge. */
const STATUS_MAP: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'badge-ghost' },
  SUBMITTED: { label: 'Diajukan', className: 'badge-warning' },
  PENDING: { label: 'Menunggu', className: 'badge-warning' },
  PENDING_APPROVAL: { label: 'Menunggu Approval', className: 'badge-warning' },
  WAITING: { label: 'Antre', className: 'badge-ghost' },
  SKIPPED: { label: 'Dilewati', className: 'badge-ghost' },
  STOCK_CHECK: { label: 'Cek Stok', className: 'badge-warning' },
  APPROVED: { label: 'Disetujui', className: 'badge-success' },
  ACTIVE: { label: 'Aktif', className: 'badge-success' },
  AVAILABLE: { label: 'Tersedia', className: 'badge-success' },
  REJECTED: { label: 'Ditolak', className: 'badge-error' },
  EXPIRED: { label: 'Kedaluwarsa', className: 'badge-error' },
  BROKEN: { label: 'Rusak', className: 'badge-error' },
  BLACKLISTED: { label: 'Blacklist', className: 'badge-error' },
  UNDER_REVIEW: { label: 'Dalam Review', className: 'badge-warning' },
  PO_ISSUED: { label: 'PO Terbit', className: 'badge-info' },
  ISSUED: { label: 'Terbit', className: 'badge-info' },
  IN_USE: { label: 'Dipakai', className: 'badge-info' },
  COMPLETED: { label: 'Selesai', className: 'badge-primary' },
  FULFILLED_FROM_STOCK: { label: 'Dipenuhi dari Stok', className: 'badge-primary' },
  QUOTATION: { label: 'Penawaran', className: 'badge-info' },
  PARTIALLY_RECEIVED: { label: 'Diterima Sebagian', className: 'badge-info' },
  RECEIVED: { label: 'Diterima', className: 'badge-info' },
  INACTIVE: { label: 'Nonaktif', className: 'badge-ghost' },
  CLOSED: { label: 'Ditutup', className: 'badge-primary' },
  CANCELLED: { label: 'Dibatalkan', className: 'badge-ghost' },
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const entry = STATUS_MAP[status];
  return (
    <span
      className={cn(
        'badge badge-sm whitespace-nowrap',
        entry?.className ?? 'badge-ghost',
        className,
      )}
    >
      {label ?? entry?.label ?? status}
    </span>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return <StatusBadge status={active ? 'ACTIVE' : 'INACTIVE'} />;
}
