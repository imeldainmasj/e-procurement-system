import { ClipboardList, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  canManageQuotations,
  formatRupiah,
  PO_STATUS_LABELS,
  PROCUREMENT_READ_ROLES,
  type PrDto,
  type PrStatus,
} from '@sipita/shared';
import { SectionCard } from '@/components/ui/SectionCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermission } from '@/hooks/usePermission';
import { formatDate } from '@/utils/formatDate';

/** Statuses from which the PR has (or had) quotations and a PO. */
const PROCUREMENT_STAGE: PrStatus[] = [
  'APPROVED',
  'QUOTATION',
  'PO_ISSUED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'COMPLETED',
];

/** Quotation progress and the PO for an approved PR. */
export function PrProcurementPanel({ pr }: { pr: PrDto }) {
  const { can, roles } = usePermission();
  const reachedProcurement =
    PROCUREMENT_STAGE.includes(pr.status) || pr.quotationCount > 0 || pr.purchaseOrder;
  if (!reachedProcurement) return null;

  const canSeeQuotations = can(...PROCUREMENT_READ_ROLES);
  const canSeePo = can('PROCUREMENT', 'VIEWER', 'WAREHOUSE');
  const po = pr.purchaseOrder;

  return (
    <SectionCard title="Pengadaan" bodyClassName="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-base-content/70">Penawaran vendor</span>
        <span className="font-medium">{pr.quotationCount}</span>
      </div>
      {po ? (
        <div className="border-base-300 rounded-box space-y-1 border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            {canSeePo ? (
              <Link to={`/purchase-order/${po.id}`} className="link font-mono">
                {po.number}
              </Link>
            ) : (
              <span className="font-mono">{po.number}</span>
            )}
            <StatusBadge status={po.status} label={PO_STATUS_LABELS[po.status]} />
          </div>
          <div>{po.vendorName}</div>
          <div className="text-base-content/70">
            {formatRupiah(po.total)} · tiba {formatDate(po.expectedDate)}
          </div>
        </div>
      ) : (
        <p className="text-base-content/60 text-sm">Purchase Order belum dibuat.</p>
      )}
      {canSeeQuotations && (
        <Link
          to={`/penawaran/${pr.id}`}
          className={`btn btn-sm ${canManageQuotations(pr.status, roles) && !po ? 'btn-primary' : 'btn-soft btn-primary'}`}
        >
          <ClipboardList className="size-4" />
          {canManageQuotations(pr.status, roles) && !po ? 'Kelola Penawaran' : 'Lihat Penawaran'}
        </Link>
      )}
      {po && canSeePo && (
        <Link to={`/purchase-order/${po.id}`} className="btn btn-soft btn-primary btn-sm">
          <ShoppingCart className="size-4" /> Lihat PO
        </Link>
      )}
    </SectionCard>
  );
}
