import {
  ArrowLeft,
  Award,
  Download,
  FileText,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  formatRupiah,
  PO_STATUS_LABELS,
  PR_STATUS_LABELS,
  SELECTION_REASON_LABELS,
  selectionJustificationReasons,
  type QuotationComparisonDto,
  type QuotationDto,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { Can } from '@/components/auth/Can';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermission } from '@/hooks/usePermission';
import { useQuotationComparison, useQuotationMutations } from '@/hooks/useProcurement';
import { toast } from '@/stores/toastStore';
import { downloadAttachment } from '@/utils/attachments';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatDate';
import { PoFormModal } from '../purchase-orders/PoFormModal';
import { VendorStatusBadge } from '../vendors/components/VendorBadges';
import { QuotationFormModal } from './QuotationFormModal';

type Dialog =
  | { kind: 'form'; quotation: QuotationDto | null }
  | { kind: 'select' | 'delete' | 'unselect' | 'po'; quotation: QuotationDto }
  | null;

const todayStr = () => formatDate(new Date(), 'YYYY-MM-DD');

function SelectWinnerModal({
  comparison,
  quotation,
  onClose,
}: {
  comparison: QuotationComparisonDto;
  quotation: QuotationDto;
  onClose: () => void;
}) {
  const { select } = useQuotationMutations();
  const [justification, setJustification] = useState('');
  const reasons = selectionJustificationReasons({
    quotationTotals: comparison.quotations.map((q) => Number(q.totalAmount)),
    selectedTotal: Number(quotation.totalAmount),
    minQuotations: comparison.minQuotations,
    approvedAmount: Number(comparison.approvedAmount),
  });
  const missing = reasons.length > 0 && justification.trim() === '';

  return (
    <Modal
      open
      onClose={onClose}
      title="Pilih Pemenang"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="btn btn-success"
            disabled={missing || select.isPending}
            onClick={() =>
              select.mutate(
                { id: quotation.id, justification: justification.trim() || null },
                {
                  onSuccess: () => {
                    toast.success(`${quotation.vendor.name} dipilih sebagai pemenang`);
                    onClose();
                  },
                  onError: (err) => toast.error(getErrorMessage(err)),
                },
              )
            }
          >
            {select.isPending && <span className="loading loading-spinner loading-sm" />}
            Pilih Pemenang
          </button>
        </>
      }
    >
      <p className="text-base-content/80">
        Pilih <b>{quotation.vendor.name}</b> dengan total{' '}
        <b>{formatRupiah(quotation.totalAmount)}</b> (sebelum PPN) sebagai pemenang?
      </p>
      {reasons.length > 0 && (
        <div role="alert" className="alert alert-warning alert-soft mt-3 text-sm">
          <div>
            <div className="font-semibold">Justifikasi wajib diisi karena:</div>
            <ul className="list-disc pl-4">
              {reasons.map((r) => (
                <li key={r}>{SELECTION_REASON_LABELS[r]}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <fieldset className="fieldset mt-3">
        <legend className="fieldset-legend">
          Justifikasi{reasons.length > 0 ? ' *' : ' (opsional)'}
        </legend>
        <textarea
          className="textarea w-full"
          rows={3}
          placeholder="mis. distributor resmi tunggal, garansi lebih panjang, waktu kirim lebih cepat"
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
        />
      </fieldset>
    </Modal>
  );
}

function ComparisonTable({
  data,
  canEdit,
  onAction,
}: {
  data: QuotationComparisonDto;
  canEdit: boolean;
  onAction: (dialog: Dialog) => void;
}) {
  const { pr, quotations } = data;
  const approved = Number(data.approvedAmount);
  const totals = quotations.map((q) => Number(q.totalAmount));
  const lowestTotal = Math.min(...totals);
  const lowestPerItem = new Map(
    pr.items.map((item) => [
      item.id,
      Math.min(
        ...quotations.map((q) => Number(q.items.find((i) => i.prItemId === item.id)?.unitPrice)),
      ),
    ]),
  );

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr className="align-bottom">
            <th className="bg-base-100 sticky left-0 z-10 min-w-48">Item</th>
            <th className="text-right">Jumlah</th>
            <th className="text-right">Estimasi</th>
            {quotations.map((q) => (
              <th key={q.id} className={cn('min-w-44 text-right', q.isSelected && 'bg-success/10')}>
                <div className="flex flex-col items-end gap-1">
                  {q.isSelected && (
                    <span className="badge badge-success badge-sm gap-1">
                      <Award className="size-3" /> Pemenang
                    </span>
                  )}
                  <Link to={`/vendor/${q.vendor.id}`} className="link link-hover text-sm">
                    {q.vendor.name}
                  </Link>
                  <span className="text-base-content/60 font-mono text-xs font-normal">
                    {q.quoteNumber}
                  </span>
                  {q.vendor.status !== 'ACTIVE' && <VendorStatusBadge status={q.vendor.status} />}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pr.items.map((item) => (
            <tr key={item.id}>
              <td className="bg-base-100 sticky left-0 z-10">
                <div className="font-medium">{item.name}</div>
                <div className="text-base-content/60 text-xs">
                  {item.item?.code ?? 'Item manual'}
                </div>
              </td>
              <td className="text-right whitespace-nowrap">
                {item.qty} {item.unit}
              </td>
              <td className="text-base-content/70 text-right whitespace-nowrap">
                {formatRupiah(item.estimatedUnitPrice)}
              </td>
              {quotations.map((q) => {
                const line = q.items.find((i) => i.prItemId === item.id);
                const lowest =
                  quotations.length > 1 && Number(line?.unitPrice) === lowestPerItem.get(item.id);
                return (
                  <td
                    key={q.id}
                    className={cn('text-right whitespace-nowrap', q.isSelected && 'bg-success/5')}
                  >
                    <div className={cn(lowest && 'text-success font-semibold')}>
                      {line ? formatRupiah(line.unitPrice) : '-'}
                      {lowest && <span className="sr-only"> (termurah)</span>}
                    </div>
                    <div className="text-base-content/60 text-xs">
                      {line ? formatRupiah(line.subtotal) : ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="text-base-content">
          <tr>
            <td className="bg-base-100 sticky left-0 z-10 font-semibold">Total (sebelum PPN)</td>
            <td />
            <td className="text-base-content/70 text-right whitespace-nowrap">
              {formatRupiah(pr.estimatedTotal)}
            </td>
            {quotations.map((q) => {
              const total = Number(q.totalAmount);
              return (
                <td
                  key={q.id}
                  className={cn('text-right whitespace-nowrap', q.isSelected && 'bg-success/5')}
                >
                  <div
                    className={cn(
                      'text-base font-bold',
                      quotations.length > 1 && total === lowestTotal && 'text-success',
                    )}
                  >
                    {formatRupiah(total)}
                  </div>
                  {total > approved ? (
                    <div className="text-error text-xs">
                      +{formatRupiah(total - approved)} di atas memo
                    </div>
                  ) : (
                    <div className="text-base-content/60 text-xs">
                      {formatRupiah(approved - total)} di bawah memo
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="bg-base-100 sticky left-0 z-10">Pengiriman</td>
            <td colSpan={2} />
            {quotations.map((q) => (
              <td key={q.id} className="text-right text-xs">
                {q.deliveryDays !== null ? `${q.deliveryDays} hari` : '-'}
              </td>
            ))}
          </tr>
          <tr>
            <td className="bg-base-100 sticky left-0 z-10">Termin Bayar</td>
            <td colSpan={2} />
            {quotations.map((q) => (
              <td key={q.id} className="text-right text-xs">
                {q.paymentTerms ?? '-'}
              </td>
            ))}
          </tr>
          <tr>
            <td className="bg-base-100 sticky left-0 z-10">Berlaku Sampai</td>
            <td colSpan={2} />
            {quotations.map((q) => {
              const expired = q.validUntil !== null && q.validUntil < todayStr();
              return (
                <td key={q.id} className={cn('text-right text-xs', expired && 'text-error')}>
                  {q.validUntil ? formatDate(q.validUntil) : '-'}
                  {expired && ' (kedaluwarsa)'}
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="bg-base-100 sticky left-0 z-10">Dokumen</td>
            <td colSpan={2} />
            {quotations.map((q) => (
              <td key={q.id} className="text-right">
                {q.attachment ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() =>
                      downloadAttachment(q.attachment!.id, q.attachment!.fileName).catch(
                        (err: unknown) => toast.error(getErrorMessage(err)),
                      )
                    }
                  >
                    <Download className="size-3" /> File
                  </button>
                ) : (
                  <span className="text-base-content/50 text-xs">-</span>
                )}
              </td>
            ))}
          </tr>
          {canEdit && (
            <tr>
              <td className="bg-base-100 sticky left-0 z-10" />
              <td colSpan={2} />
              {quotations.map((q) => (
                <td key={q.id} className="text-right">
                  <div className="flex flex-col items-end gap-1">
                    {q.isSelected ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => onAction({ kind: 'unselect', quotation: q })}
                      >
                        <Undo2 className="size-3" /> Batalkan pilihan
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-success btn-outline btn-xs"
                        onClick={() => onAction({ kind: 'select', quotation: q })}
                      >
                        <Award className="size-3" /> Pilih
                      </button>
                    )}
                    {!q.isSelected && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          aria-label={`Ubah penawaran ${q.vendor.name}`}
                          onClick={() => onAction({ kind: 'form', quotation: q })}
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-error"
                          aria-label={`Hapus penawaran ${q.vendor.name}`}
                          onClick={() => onAction({ kind: 'delete', quotation: q })}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              ))}
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}

export function QuotationComparisonPage() {
  const { prId } = useParams();
  const query = useQuotationComparison(prId);
  const m = useQuotationMutations();
  const { can } = usePermission();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const onError = (err: unknown) => toast.error(getErrorMessage(err));

  if (query.isPending) return <div className="skeleton h-96 w-full" />;
  if (query.isError) {
    return (
      <div role="alert" className="alert alert-error">
        <span>{getErrorMessage(query.error)}</span>
        <Link to="/pengajuan" className="btn btn-sm">
          Kembali
        </Link>
      </div>
    );
  }
  const data = query.data;
  const { pr, quotations } = data;
  const canEdit = data.editable && can('PROCUREMENT');
  const winner = quotations.find((q) => q.isSelected);
  const remaining = Math.max(0, data.minQuotations - quotations.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to={`/pengajuan/${pr.id}`}
            className="text-base-content/60 mb-1 flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="size-3" /> Kembali ke pengajuan
          </Link>
          <h1 className="text-2xl font-bold">Perbandingan Penawaran</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{pr.number}</span>
            <span>{pr.title}</span>
            <StatusBadge status={pr.status} label={PR_STATUS_LABELS[pr.status]} />
          </div>
        </div>
        <Can role="PROCUREMENT">
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button
                type="button"
                className="btn btn-soft btn-secondary btn-sm"
                onClick={() => setDialog({ kind: 'form', quotation: null })}
              >
                <Plus className="size-4" /> Tambah Penawaran
              </button>
            )}
            {canEdit && winner && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setDialog({ kind: 'po', quotation: winner })}
              >
                <ShoppingCart className="size-4" /> Buat PO
              </button>
            )}
          </div>
        </Can>
      </div>

      <div className="stats stats-vertical sm:stats-horizontal bg-base-100 w-full shadow-velzon">
        <div className="stat">
          <div className="stat-title">Nilai Disetujui (Memo)</div>
          <div className="stat-value text-xl">{formatRupiah(data.approvedAmount)}</div>
          <div className="stat-desc">
            {pr.division.name} · {pr.requester.name}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">Penawaran Masuk</div>
          <div className="stat-value text-xl">
            {quotations.length} / {data.minQuotations}
          </div>
          <div className="stat-desc">
            {remaining > 0 ? `Kurang ${remaining} penawaran dari minimum` : 'Memenuhi minimum'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">Dibutuhkan</div>
          <div className="stat-value text-xl">{formatDate(pr.neededDate)}</div>
          <div className="stat-desc">Tanggal kebutuhan pemohon</div>
        </div>
      </div>

      {data.purchaseOrder && (
        <div role="status" className="alert alert-info alert-soft">
          <FileText className="size-5" />
          <span>
            Purchase Order <b>{data.purchaseOrder.number}</b> (
            {PO_STATUS_LABELS[data.purchaseOrder.status]}) sudah dibuat dari penawaran pemenang.
            Penawaran tidak dapat diubah selama PO aktif.
          </span>
          <Link to={`/purchase-order/${data.purchaseOrder.id}`} className="btn btn-sm">
            Lihat PO
          </Link>
        </div>
      )}
      {!data.editable && !data.purchaseOrder && (
        <div role="status" className="alert alert-soft">
          <span>
            Pengajuan berstatus {PR_STATUS_LABELS[pr.status]}; penawaran hanya dapat dikelola untuk
            pengajuan yang sudah disetujui.
          </span>
        </div>
      )}
      {winner?.selectionJustification && (
        <div role="status" className="alert alert-success alert-soft">
          <Award className="size-5" />
          <span>
            <b>Justifikasi pemenang ({winner.vendor.name}):</b> {winner.selectionJustification}
          </span>
        </div>
      )}

      <div className="card">
        <div className="card-body p-4">
          {quotations.length === 0 ? (
            <EmptyState
              title="Belum ada penawaran"
              description={`Input penawaran dari minimal ${data.minQuotations} vendor untuk dibandingkan.`}
            />
          ) : (
            <ComparisonTable data={data} canEdit={canEdit} onAction={setDialog} />
          )}
          {quotations.length > 1 && (
            <p className="text-base-content/60 text-xs">
              Harga termurah per item dan total ditandai hijau.
            </p>
          )}
        </div>
      </div>

      {dialog?.kind === 'form' && (
        <QuotationFormModal comparison={data} quotation={dialog.quotation} onClose={close} />
      )}
      {dialog?.kind === 'select' && (
        <SelectWinnerModal comparison={data} quotation={dialog.quotation} onClose={close} />
      )}
      {dialog?.kind === 'po' && (
        <PoFormModal mode="create" quotation={dialog.quotation} onClose={close} />
      )}
      <ConfirmModal
        open={dialog?.kind === 'unselect'}
        onClose={close}
        loading={m.unselect.isPending}
        variant="warning"
        title="Batalkan Pilihan Pemenang"
        confirmLabel="Batalkan Pilihan"
        message={<>Batalkan {dialog?.quotation?.vendor.name} sebagai pemenang?</>}
        onConfirm={() =>
          dialog?.quotation &&
          m.unselect.mutate(dialog.quotation.id, {
            onSuccess: () => toast.success('Pilihan pemenang dibatalkan'),
            onError,
            onSettled: close,
          })
        }
      />
      <ConfirmModal
        open={dialog?.kind === 'delete'}
        onClose={close}
        loading={m.remove.isPending}
        variant="error"
        title="Hapus Penawaran"
        confirmLabel="Hapus"
        message={
          <>Hapus penawaran {dialog?.quotation?.vendor.name}? File penawaran ikut dihapus.</>
        }
        onConfirm={() =>
          dialog?.quotation &&
          m.remove.mutate(dialog.quotation.id, {
            onSuccess: () => toast.success('Penawaran dihapus'),
            onError,
            onSettled: close,
          })
        }
      />
    </div>
  );
}
