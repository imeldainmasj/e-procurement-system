import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { formatRupiah } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { usePurchaseRequest, usePurchaseRequestHistory } from '@/hooks/usePurchaseRequests';
import { formatDate, formatDateTime } from '@/utils/formatDate';
import { PrActions } from './components/PrActions';
import { PrApprovalPanel } from './components/PrApprovalPanel';
import { PriorityBadge, PrStatusBadge } from './components/PrBadges';
import { PrHistory } from './components/PrHistory';
import { PrProcurementPanel } from './components/PrProcurementPanel';
import { PrSteps } from './components/PrSteps';

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-base-content/60 text-xs">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export function PrDetailPage() {
  const { id } = useParams();
  const prQuery = usePurchaseRequest(id);
  const historyQuery = usePurchaseRequestHistory(id);

  if (prQuery.isPending) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-1/2" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }
  if (prQuery.isError) {
    return (
      <div role="alert" className="alert alert-error">
        <span>{getErrorMessage(prQuery.error)}</span>
        <Link to="/pengajuan" className="btn btn-sm">
          Kembali ke daftar
        </Link>
      </div>
    );
  }

  const pr = prQuery.data;
  const history = historyQuery.data ?? [];
  const cancelledFrom =
    pr.status === 'CANCELLED'
      ? (history.findLast((h) => h.toStatus === 'CANCELLED')?.fromStatus ?? null)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/pengajuan"
            className="text-base-content/60 mb-1 flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="size-3" /> Daftar pengajuan
          </Link>
          <h1 className="text-2xl font-bold">{pr.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{pr.number ?? 'Draft (belum bernomor)'}</span>
            <PrStatusBadge status={pr.status} />
            <PriorityBadge priority={pr.priority} />
          </div>
        </div>
        <PrActions pr={pr} />
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4">
          <PrSteps status={pr.status} cancelledFrom={cancelledFrom} />
        </div>
      </div>

      {pr.cancellation && (
        <div role="alert" className="alert alert-error alert-soft">
          <span>
            <b>Dibatalkan</b> pada {formatDateTime(pr.cancellation.at)}. Alasan:{' '}
            {pr.cancellation.reason}
          </span>
        </div>
      )}
      {pr.stockCheck && (
        <div
          role="status"
          className={`alert alert-soft ${pr.status === 'FULFILLED_FROM_STOCK' ? 'alert-success' : 'alert-info'}`}
        >
          <span>
            <b>Hasil cek stok</b> oleh {pr.stockCheck.by?.name ?? '-'} (
            {formatDateTime(pr.stockCheck.at)}):{' '}
            {pr.status === 'FULFILLED_FROM_STOCK'
              ? 'tersedia di gudang'
              : 'tidak tersedia, diteruskan ke approval'}
            {pr.stockCheck.notes && <> — {pr.stockCheck.notes}</>}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body p-4">
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Info label="Pemohon">{pr.requester.name}</Info>
                <Info label="Divisi">{pr.division.name}</Info>
                <Info label="Tanggal Dibutuhkan">{formatDate(pr.neededDate)}</Info>
                <Info label="Diajukan">
                  {pr.submittedAt ? formatDateTime(pr.submittedAt) : '-'}
                </Info>
              </dl>
              <div className="mt-4">
                <div className="text-base-content/60 text-xs">Justifikasi</div>
                <p className="whitespace-pre-line">{pr.justification}</p>
              </div>
            </div>
          </div>

          <div className="card bg-base-100 shadow-sm">
            <div className="card-body p-4">
              <h2 className="card-title text-base">Daftar Item</h2>
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Item</th>
                      <th className="text-right">Jumlah</th>
                      <th className="text-right">Estimasi Harga</th>
                      <th className="text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.items.map((item, i) => (
                      <tr key={item.id}>
                        <td>{i + 1}</td>
                        <td>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-base-content/60 text-xs">
                            {item.item ? item.item.code : 'Item manual'}
                            {item.item?.isAsset && ' · Aset'}
                            {item.notes && ` · ${item.notes}`}
                          </div>
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {item.qty} {item.unit}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {formatRupiah(item.estimatedUnitPrice)}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {formatRupiah(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="text-right">
                        Estimasi Total
                      </td>
                      <td className="text-right text-base whitespace-nowrap">
                        {formatRupiah(pr.estimatedTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <PrProcurementPanel pr={pr} />
          <PrApprovalPanel pr={pr} />
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body p-4">
              <h2 className="card-title text-base">Riwayat</h2>
              {historyQuery.isPending ? (
                <div className="skeleton h-32 w-full" />
              ) : historyQuery.isError ? (
                <div role="alert" className="alert alert-error alert-soft text-sm">
                  {getErrorMessage(historyQuery.error)}
                </div>
              ) : (
                <PrHistory entries={history} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
