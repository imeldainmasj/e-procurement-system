import { ArrowLeft, Ban, FileDown, Pencil, Send, Star } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  formatRupiah,
  PO_RATABLE_STATUSES,
  PO_STATUS_LABELS,
  type PoDto,
  type VendorRatingInput,
} from '@sipita/shared';
import { purchaseOrdersApi } from '@/api/procurement.api';
import { getErrorMessage } from '@/api/client';
import { Can } from '@/components/auth/Can';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Modal } from '@/components/ui/Modal';
import { RatingStars } from '@/components/ui/RatingStars';
import { SectionCard } from '@/components/ui/SectionCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePdfUrl } from '@/hooks/usePdfUrl';
import { usePoMutations, usePurchaseOrder } from '@/hooks/useProcurement';
import { toast } from '@/stores/toastStore';
import { downloadBlob, pdfFileName } from '@/utils/download';
import { formatDate, formatDateTime } from '@/utils/formatDate';
import { PoFormModal } from './PoFormModal';

type Dialog = 'edit' | 'issue' | 'cancel' | 'rate' | null;

const ASPECTS = [
  ['onTime', 'Ketepatan Waktu'],
  ['quality', 'Kualitas'],
  ['price', 'Harga'],
  ['service', 'Layanan'],
] as const;

function RatingModal({ po, onClose }: { po: PoDto; onClose: () => void }) {
  const { rate } = usePoMutations();
  const [scores, setScores] = useState<Record<(typeof ASPECTS)[number][0], number>>({
    onTime: 0,
    quality: 0,
    price: 0,
    service: 0,
  });
  const [notes, setNotes] = useState('');
  const incomplete = Object.values(scores).some((v) => v === 0);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Nilai ${po.vendor.name}`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={incomplete || rate.isPending}
            onClick={() => {
              const input: VendorRatingInput = { ...scores, notes };
              rate.mutate(
                { id: po.id, input },
                {
                  onSuccess: () => {
                    toast.success('Rating vendor disimpan');
                    onClose();
                  },
                  onError: (err) => toast.error(getErrorMessage(err)),
                },
              );
            }}
          >
            {rate.isPending && <span className="loading loading-spinner loading-sm" />}
            Simpan
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {ASPECTS.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-sm">{label}</span>
            <div className="rating rating-sm" role="radiogroup" aria-label={label}>
              {[1, 2, 3, 4, 5].map((n) => (
                <input
                  key={n}
                  type="radio"
                  name={`rating-${key}`}
                  className="mask mask-star-2 bg-warning"
                  aria-label={`${n} bintang`}
                  checked={scores[key] === n}
                  onChange={() => setScores((s) => ({ ...s, [key]: n }))}
                />
              ))}
            </div>
          </div>
        ))}
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Catatan (opsional)</legend>
          <textarea
            className="textarea w-full"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </fieldset>
      </div>
    </Modal>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-base-content/60 text-xs">{label}</dt>
      <dd className="font-medium break-words">{children || '-'}</dd>
    </div>
  );
}

export function PoDetailPage() {
  const { id } = useParams();
  const query = usePurchaseOrder(id);
  const m = usePoMutations();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const onError = (err: unknown) => toast.error(getErrorMessage(err));
  // Re-render the PDF whenever the PO changes.
  const pdf = usePdfUrl(
    ['purchase-orders', id, 'pdf', query.data?.updatedAt],
    () => purchaseOrdersApi.pdf(id!),
    Boolean(query.data),
  );

  if (query.isPending) return <div className="skeleton h-96 w-full" />;
  if (query.isError) {
    return (
      <div role="alert" className="alert alert-error">
        <span>{getErrorMessage(query.error)}</span>
        <Link to="/purchase-order" className="btn btn-sm">
          Kembali
        </Link>
      </div>
    );
  }
  const po = query.data;
  const ratable = PO_RATABLE_STATUSES.includes(po.status) && !po.rating;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/purchase-order"
            className="text-base-content/60 mb-1 flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="size-3" /> Daftar PO
          </Link>
          <h1 className="text-lg font-semibold">{po.number}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span>{po.vendor.name}</span>
            <StatusBadge status={po.status} label={PO_STATUS_LABELS[po.status]} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Can role="PROCUREMENT">
            {po.status === 'DRAFT' && (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setDialog('issue')}
                >
                  <Send className="size-4" /> Terbitkan PO
                </button>
                <button
                  type="button"
                  className="btn btn-soft btn-primary btn-sm"
                  onClick={() => setDialog('edit')}
                >
                  <Pencil className="size-4" /> Ubah
                </button>
              </>
            )}
            {ratable && (
              <button
                type="button"
                className="btn btn-soft btn-primary btn-sm"
                onClick={() => setDialog('rate')}
              >
                <Star className="size-4" /> Beri Rating
              </button>
            )}
            {(po.status === 'DRAFT' || po.status === 'ISSUED') && (
              <button
                type="button"
                className="btn btn-ghost btn-sm text-error"
                onClick={() => setDialog('cancel')}
              >
                <Ban className="size-4" /> Batalkan
              </button>
            )}
          </Can>
          <button
            type="button"
            className="btn btn-soft btn-primary btn-sm"
            disabled={!pdf.blob}
            onClick={() => pdf.blob && downloadBlob(pdf.blob, pdfFileName(po.number))}
          >
            <FileDown className="size-4" /> Unduh PDF
          </button>
        </div>
      </div>

      {po.cancellation && (
        <div role="alert" className="alert alert-error alert-soft">
          <span>
            <b>Dibatalkan</b> pada {formatDateTime(po.cancellation.at)}. Alasan:{' '}
            {po.cancellation.reason}
          </span>
        </div>
      )}
      {po.status === 'DRAFT' && (
        <div role="status" className="alert alert-info alert-soft">
          <span>
            PO masih draft. Periksa isi PDF, lalu terbitkan untuk dikirim ke vendor. Setelah terbit,
            pengajuan berstatus &quot;PO Terbit&quot; dan Gudang IT diberi tahu.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-2">
          <SectionCard title="Detail PO" bodyClassName="space-y-3">
            <dl className="grid grid-cols-2 gap-3">
              <Info label="Pengajuan">
                <Link to={`/pengajuan/${po.pr.id}`} className="link font-mono">
                  {po.pr.number}
                </Link>
                <div className="text-sm font-normal">{po.pr.title}</div>
              </Info>
              <Info label="Pemohon">
                {po.requester.name}
                <div className="text-base-content/60 text-xs font-normal">{po.division.name}</div>
              </Info>
              <Info label="Tanggal PO">{formatDate(po.orderDate)}</Info>
              <Info label="Estimasi Tiba">{formatDate(po.expectedDate)}</Info>
              <Info label="No. Penawaran">
                <Link to={`/penawaran/${po.pr.id}`} className="link">
                  {po.quotation.quoteNumber}
                </Link>
              </Info>
              <Info label="Diterbitkan">
                {po.issuedAt ? `${formatDateTime(po.issuedAt)} · ${po.issuedBy?.name ?? ''}` : '-'}
              </Info>
            </dl>
            {po.quotation.selectionJustification && (
              <p className="text-sm">
                <span className="text-base-content/60">Justifikasi pemenang: </span>
                {po.quotation.selectionJustification}
              </p>
            )}
          </SectionCard>

          <SectionCard title="Item" flush>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead className="bg-base-200/60 text-base-content/60 text-xs uppercase">
                  <tr>
                    <th>Item</th>
                    <th className="text-right">Jumlah</th>
                    <th className="text-right">Diterima</th>
                    <th className="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {po.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-base-content/60 text-xs">
                          {item.item?.code ?? 'Item manual'} · {formatRupiah(item.unitPrice)}/
                          {item.unit}
                        </div>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {item.qty} {item.unit}
                      </td>
                      <td className="text-right">{item.receivedQty}</td>
                      <td className="text-right whitespace-nowrap">
                        {formatRupiah(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="text-right">
                      Subtotal
                    </td>
                    <td className="text-right whitespace-nowrap">{formatRupiah(po.subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="text-right">
                      PPN {Number(po.taxPercent).toLocaleString('id-ID')}%
                    </td>
                    <td className="text-right whitespace-nowrap">{formatRupiah(po.taxAmount)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="text-right font-bold">
                      Total
                    </td>
                    <td className="text-right text-base font-bold whitespace-nowrap">
                      {formatRupiah(po.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Rating Vendor" bodyClassName="flex flex-col gap-2">
            {po.rating ? (
              <>
                <RatingStars value={po.rating.average} size="md" />
                <div className="text-base-content/70 flex flex-wrap gap-x-4 text-xs">
                  {ASPECTS.map(([key, label]) => (
                    <span key={key}>
                      {label}: {po.rating![key]}
                    </span>
                  ))}
                </div>
                {po.rating.notes && <p className="text-sm">{po.rating.notes}</p>}
                <p className="text-base-content/60 text-xs">
                  {po.rating.ratedBy.name} · {formatDateTime(po.rating.createdAt)}
                </p>
              </>
            ) : (
              <p className="text-base-content/60 text-sm">
                {ratable
                  ? 'Barang sudah diterima. Beri rating kinerja vendor untuk PO ini.'
                  : 'Rating dapat diberikan setelah barang dari PO ini diterima gudang.'}
              </p>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Pratinjau Dokumen" className="xl:col-span-3" flush bodyClassName="p-2">
          {pdf.error ? (
            <div role="alert" className="alert alert-error">
              <span>{getErrorMessage(pdf.error)}</span>
            </div>
          ) : pdf.url ? (
            <iframe
              title={`Pratinjau ${po.number}`}
              src={pdf.url}
              className="rounded-box h-[75vh] w-full"
            />
          ) : (
            <div className="skeleton h-[75vh] w-full" />
          )}
        </SectionCard>
      </div>

      {dialog === 'edit' && <PoFormModal mode="edit" po={po} onClose={close} />}
      {dialog === 'rate' && <RatingModal po={po} onClose={close} />}
      <ConfirmModal
        open={dialog === 'issue'}
        onClose={close}
        loading={m.issue.isPending}
        title="Terbitkan Purchase Order"
        confirmLabel="Terbitkan"
        message={
          <>
            Terbitkan <b>{po.number}</b> ke <b>{po.vendor.name}</b> senilai{' '}
            <b>{formatRupiah(po.total)}</b>? PO yang sudah terbit tidak dapat diubah.
          </>
        }
        onConfirm={() =>
          m.issue.mutate(po.id, {
            onSuccess: () => toast.success(`${po.number} diterbitkan`),
            onError,
            onSettled: close,
          })
        }
      />
      <ConfirmModal
        open={dialog === 'cancel'}
        onClose={close}
        loading={m.cancel.isPending}
        variant="error"
        requireReason
        reasonLabel="Alasan pembatalan"
        title="Batalkan Purchase Order"
        confirmLabel="Batalkan PO"
        message={
          po.status === 'ISSUED' ? (
            <>
              Batalkan <b>{po.number}</b> yang sudah terbit? Pengajuan kembali ke tahap penawaran
              sehingga pemenang dapat dipilih ulang.
            </>
          ) : (
            <>
              Batalkan draft <b>{po.number}</b>?
            </>
          )
        }
        onConfirm={(reason) =>
          m.cancel.mutate(
            { id: po.id, reason: reason ?? '' },
            { onSuccess: () => toast.success('PO dibatalkan'), onError, onSettled: close },
          )
        }
      />
    </div>
  );
}
