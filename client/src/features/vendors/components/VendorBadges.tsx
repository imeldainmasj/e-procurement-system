import { AlertTriangle, CircleX } from 'lucide-react';
import { type DocumentExpiryState, VENDOR_STATUS_LABELS, type VendorStatus } from '@sipita/shared';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function VendorStatusBadge({ status }: { status: VendorStatus }) {
  return <StatusBadge status={status} label={VENDOR_STATUS_LABELS[status]} />;
}

export function ExpiryBadge({ state }: { state: DocumentExpiryState }) {
  if (state === 'expired') return <span className="badge badge-sm badge-error">Kedaluwarsa</span>;
  if (state === 'expiring')
    return <span className="badge badge-sm badge-warning">Segera berakhir</span>;
  if (state === 'valid')
    return <span className="badge badge-sm badge-success badge-outline">Berlaku</span>;
  return <span className="badge badge-sm badge-ghost">Tanpa masa berlaku</span>;
}

/** Compact warning icons for the vendor list. */
export function DocumentAlerts({ expired, expiring }: { expired: number; expiring: number }) {
  if (!expired && !expiring) return null;
  return (
    <span className="inline-flex gap-2">
      {expired > 0 && (
        <span
          className="text-error inline-flex items-center gap-1 text-xs"
          title={`${expired} dokumen kedaluwarsa`}
        >
          <CircleX className="size-3.5" /> {expired}
        </span>
      )}
      {expiring > 0 && (
        <span
          className="text-warning inline-flex items-center gap-1 text-xs"
          title={`${expiring} dokumen segera berakhir`}
        >
          <AlertTriangle className="size-3.5" /> {expiring}
        </span>
      )}
    </span>
  );
}
