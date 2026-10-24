import { ArrowLeft, Download, Eye, Pencil, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  formatFileSize,
  formatNpwp,
  VENDOR_DOCUMENT_TYPE_LABELS,
  type VendorDocumentDto,
  type VendorDto,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { Can } from '@/components/auth/Can';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { RatingStars } from '@/components/ui/RatingStars';
import { useVendor, useVendorMutations, useVendorRatings } from '@/hooks/useVendors';
import { toast } from '@/stores/toastStore';
import { canPreview, downloadAttachment, previewAttachment } from '@/utils/attachments';
import { cn } from '@/utils/cn';
import { formatDate, formatDateTime } from '@/utils/formatDate';
import { DocumentUploadModal } from './components/DocumentUploadModal';
import { ExpiryBadge, VendorStatusBadge } from './components/VendorBadges';
import { VendorFormModal } from './components/VendorFormModal';
import { VendorStatusModal } from './components/VendorStatusModal';

type Tab = 'info' | 'documents' | 'ratings';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-base-content/60 text-xs">{label}</dt>
      <dd className="font-medium break-words">{children || '-'}</dd>
    </div>
  );
}

function InfoTab({ vendor }: { vendor: VendorDto }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4">
          <h3 className="card-title text-base">Profil & Kontak</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Field label="NPWP">{formatNpwp(vendor.npwp)}</Field>
            <Field label="Kota">{vendor.city}</Field>
            <div className="col-span-2">
              <Field label="Alamat">{vendor.address}</Field>
            </div>
            <Field label="PIC">{vendor.picName}</Field>
            <Field label="Telepon">{vendor.phone}</Field>
            <div className="col-span-2">
              <Field label="Email">{vendor.email}</Field>
            </div>
          </dl>
        </div>
      </div>
      <div className="space-y-4">
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <h3 className="card-title text-base">Rekening Bank</h3>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Bank">{vendor.bankName}</Field>
              <Field label="Nomor Rekening">
                <span className="font-mono">{vendor.bankAccount}</span>
              </Field>
              <div className="col-span-2">
                <Field label="Atas Nama">{vendor.bankAccountName}</Field>
              </div>
            </dl>
          </div>
        </div>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <h3 className="card-title text-base">Kategori yang Dipasok</h3>
            {vendor.categories.length === 0 ? (
              <p className="text-base-content/60 text-sm">Belum ada kategori.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {vendor.categories.map((c) => (
                  <span key={c.id} className="badge badge-outline">
                    {c.name}
                  </span>
                ))}
              </div>
            )}
            {vendor.notes && (
              <p className="text-base-content/80 mt-2 text-sm whitespace-pre-line">
                {vendor.notes}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentsTab({ vendor }: { vendor: VendorDto }) {
  const { removeDocument } = useVendorMutations();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<VendorDocumentDto | null>(null);
  const run = (fn: () => Promise<void>) =>
    fn().catch((err: unknown) => toast.error(getErrorMessage(err)));

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center justify-between">
          <h3 className="card-title text-base">Dokumen Legal</h3>
          <Can role="PROCUREMENT">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setUploading(true)}
            >
              <Upload className="size-4" /> Unggah Dokumen
            </button>
          </Can>
        </div>
        {vendor.documents.length === 0 ? (
          <EmptyState
            title="Belum ada dokumen"
            description="Unggah SIUP, NIB, NPWP, atau akta perusahaan."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Jenis</th>
                  <th>Nomor</th>
                  <th>Berlaku Sampai</th>
                  <th>File</th>
                  <th>Diunggah</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vendor.documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className="font-medium">{VENDOR_DOCUMENT_TYPE_LABELS[doc.type]}</td>
                    <td>{doc.number ?? '-'}</td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        {doc.expiresAt && (
                          <span className="whitespace-nowrap">{formatDate(doc.expiresAt)}</span>
                        )}
                        <ExpiryBadge state={doc.expiryState} />
                      </div>
                    </td>
                    <td>
                      <div className="max-w-48 truncate text-sm">{doc.attachment.fileName}</div>
                      <div className="text-base-content/60 text-xs">
                        {formatFileSize(doc.attachment.size)}
                      </div>
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {formatDateTime(doc.createdAt)}
                      <div className="text-base-content/60">{doc.attachment.uploadedBy?.name}</div>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {canPreview(doc.attachment.mimeType) && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            aria-label="Lihat"
                            onClick={() => void run(() => previewAttachment(doc.attachment.id))}
                          >
                            <Eye className="size-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          aria-label="Unduh"
                          onClick={() =>
                            void run(() =>
                              downloadAttachment(doc.attachment.id, doc.attachment.fileName),
                            )
                          }
                        >
                          <Download className="size-4" />
                        </button>
                        <Can role="PROCUREMENT">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-error"
                            aria-label="Hapus"
                            onClick={() => setDeleting(doc)}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {uploading && (
        <DocumentUploadModal vendorId={vendor.id} onClose={() => setUploading(false)} />
      )}
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        loading={removeDocument.isPending}
        variant="error"
        title="Hapus Dokumen"
        confirmLabel="Hapus"
        message={
          <>
            Hapus dokumen <b>{deleting && VENDOR_DOCUMENT_TYPE_LABELS[deleting.type]}</b> (
            {deleting?.attachment.fileName})? File akan dihapus permanen.
          </>
        }
        onConfirm={() =>
          deleting &&
          removeDocument.mutate(
            { id: vendor.id, documentId: deleting.id },
            {
              onSuccess: () => toast.success('Dokumen dihapus'),
              onError: (err) => toast.error(getErrorMessage(err)),
              onSettled: () => setDeleting(null),
            },
          )
        }
      />
    </div>
  );
}

const ASPECTS = [
  ['onTime', 'Ketepatan Waktu'],
  ['quality', 'Kualitas'],
  ['price', 'Harga'],
  ['service', 'Layanan'],
] as const;

function RatingsTab({ vendor }: { vendor: VendorDto }) {
  const [page, setPage] = useState(1);
  const ratings = useVendorRatings(vendor.id, page);
  const summary = vendor.ratingSummary;
  const totalPages = Math.max(1, Math.ceil((ratings.data?.meta.total ?? 0) / 10));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body gap-3 p-4">
          <h3 className="card-title text-base">Ringkasan</h3>
          <RatingStars value={summary.overall} count={summary.count} size="md" />
          <div className="space-y-2">
            {ASPECTS.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-base-content/70">{label}</span>
                <RatingStars value={summary[key]} />
              </div>
            ))}
          </div>
          <p className="text-base-content/60 text-xs">
            Rating diberikan satu kali per Purchase Order setelah barang diterima.
          </p>
        </div>
      </div>
      <div className="card bg-base-100 shadow-sm lg:col-span-2">
        <div className="card-body p-4">
          <h3 className="card-title text-base">Riwayat Rating</h3>
          {ratings.isPending ? (
            <div className="skeleton h-24 w-full" />
          ) : ratings.data?.data.length === 0 ? (
            <EmptyState
              title="Belum ada rating"
              description="Rating akan muncul setelah PO dengan vendor ini selesai diterima (modul PO & Penerimaan)."
            />
          ) : (
            <ul className="divide-base-200 divide-y">
              {ratings.data?.data.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <RatingStars value={r.average} />
                    <span className="text-base-content/60 text-xs">
                      {r.ratedBy.name} · {formatDateTime(r.createdAt)}
                    </span>
                  </div>
                  <div className="text-base-content/70 mt-1 flex flex-wrap gap-x-4 text-xs">
                    {ASPECTS.map(([key, label]) => (
                      <span key={key}>
                        {label}: {r[key]}
                      </span>
                    ))}
                  </div>
                  {r.notes && <p className="mt-1 text-sm">{r.notes}</p>}
                </li>
              ))}
            </ul>
          )}
          {totalPages > 1 && (
            <div className="join self-end">
              <button
                type="button"
                className="join-item btn btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                ‹
              </button>
              <span className="join-item btn btn-sm pointer-events-none">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="join-item btn btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                ›
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function VendorDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const vendorQuery = useVendor(id);
  const { remove } = useVendorMutations();
  const [tab, setTab] = useState<Tab>('info');
  const [dialog, setDialog] = useState<'edit' | 'status' | 'delete' | null>(null);

  if (vendorQuery.isPending) return <div className="skeleton h-96 w-full" />;
  if (vendorQuery.isError) {
    return (
      <div role="alert" className="alert alert-error">
        <span>{getErrorMessage(vendorQuery.error)}</span>
        <Link to="/vendor" className="btn btn-sm">
          Kembali
        </Link>
      </div>
    );
  }
  const vendor = vendorQuery.data;
  const { expired, expiring } = vendor.documentAlerts;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/vendor"
            className="text-base-content/60 mb-1 flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="size-3" /> Daftar vendor
          </Link>
          <h1 className="text-2xl font-bold">{vendor.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{vendor.code}</span>
            <VendorStatusBadge status={vendor.status} />
            <RatingStars value={vendor.ratingSummary.overall} count={vendor.ratingSummary.count} />
          </div>
        </div>
        <Can role="PROCUREMENT">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setDialog('edit')}
            >
              <Pencil className="size-4" /> Ubah
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setDialog('status')}
            >
              <ShieldAlert className="size-4" /> Ubah Status
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm text-error"
              onClick={() => setDialog('delete')}
            >
              <Trash2 className="size-4" /> Hapus
            </button>
          </div>
        </Can>
      </div>

      {vendor.status !== 'ACTIVE' && vendor.statusReason && (
        <div
          role="alert"
          className={cn(
            'alert alert-soft',
            vendor.status === 'BLACKLISTED' ? 'alert-error' : 'alert-warning',
          )}
        >
          <span>
            <b>Alasan status:</b> {vendor.statusReason}
          </span>
        </div>
      )}
      {(expired > 0 || expiring > 0) && (
        <div
          role="alert"
          className={cn('alert alert-soft', expired > 0 ? 'alert-error' : 'alert-warning')}
        >
          <span>
            {expired > 0 && `${expired} dokumen sudah kedaluwarsa. `}
            {expiring > 0 && `${expiring} dokumen akan berakhir dalam 30 hari. `}
            <button type="button" className="link" onClick={() => setTab('documents')}>
              Lihat dokumen
            </button>
          </span>
        </div>
      )}

      <div role="tablist" className="tabs tabs-border">
        {(
          [
            ['info', 'Informasi'],
            ['documents', `Dokumen (${vendor.documents.length})`],
            ['ratings', `Rating (${vendor.ratingSummary.count})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={cn('tab', tab === key && 'tab-active')}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'info' && <InfoTab vendor={vendor} />}
      {tab === 'documents' && <DocumentsTab vendor={vendor} />}
      {tab === 'ratings' && <RatingsTab vendor={vendor} />}

      {dialog === 'edit' && <VendorFormModal vendor={vendor} onClose={() => setDialog(null)} />}
      {dialog === 'status' && <VendorStatusModal vendor={vendor} onClose={() => setDialog(null)} />}
      <ConfirmModal
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        loading={remove.isPending}
        variant="error"
        title="Hapus Vendor"
        confirmLabel="Hapus"
        message={
          <>
            Hapus vendor <b>{vendor.name}</b>? Data dan riwayatnya tetap tersimpan, tetapi vendor
            tidak muncul lagi di daftar. Untuk menghentikan kerja sama sementara, gunakan status
            Nonaktif.
          </>
        }
        onConfirm={() =>
          remove.mutate(vendor.id, {
            onSuccess: () => {
              toast.success('Vendor dihapus');
              navigate('/vendor');
            },
            onError: (err) => toast.error(getErrorMessage(err)),
            onSettled: () => setDialog(null),
          })
        }
      />
    </div>
  );
}
