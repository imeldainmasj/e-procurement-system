import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatNpwp } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { Can } from '@/components/auth/Can';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
import { vendorHooks } from '@/hooks/useVendors';
import { toast } from '@/stores/toastStore';
import { VendorFormModal } from './components/VendorFormModal';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-base-content/60 text-xs">{label}</dt>
      <dd className="font-medium break-words">{children || '-'}</dd>
    </div>
  );
}

export function VendorDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const vendorQuery = vendorHooks.useDetail(id);
  const remove = vendorHooks.useRemove();
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/vendor"
            className="text-base-content/60 mb-1 flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="size-3" /> Daftar vendor
          </Link>
          <h1 className="text-lg font-semibold">{vendor.name}</h1>
          <span className="font-mono text-sm">{vendor.code}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Can feature="VENDOR" action="update">
            <button
              type="button"
              className="btn btn-soft btn-primary btn-sm"
              onClick={() => setDialog('edit')}
            >
              <Pencil className="size-4" /> Ubah
            </button>
          </Can>
          <Can feature="VENDOR" action="delete">
            <button
              type="button"
              className="btn btn-soft btn-error btn-sm"
              onClick={() => setDialog('delete')}
            >
              <Trash2 className="size-4" /> Hapus
            </button>
          </Can>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title="Profil & Kontak">
          <dl className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Alamat">{vendor.address}</Field>
            </div>
            <Field label="NPWP">{formatNpwp(vendor.npwp)}</Field>
            <Field label="PIC Vendor">{vendor.picName}</Field>
            <Field label="Telepon">{vendor.phone}</Field>
            <Field label="Email">{vendor.email}</Field>
          </dl>
        </SectionCard>
        <SectionCard
          title="Riwayat Pengadaan"
          className="lg:col-span-2"
          actions={
            <span className="badge badge-soft badge-primary">
              {vendor.workCount} pekerjaan · {vendor.agreementCount} kontrak
            </span>
          }
        >
          <EmptyState
            title="Riwayat pengadaan belum tersedia"
            description="Daftar pekerjaan dan kontrak vendor ini tampil setelah modul Pekerjaan selesai."
          />
        </SectionCard>
      </div>

      {dialog === 'edit' && <VendorFormModal vendor={vendor} onClose={() => setDialog(null)} />}
      <ConfirmModal
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        loading={remove.isPending}
        variant="error"
        title="Hapus Vendor"
        confirmLabel="Hapus"
        message={
          <>
            Hapus vendor <b>{vendor.name}</b>? Vendor yang sudah tercatat pada pekerjaan atau
            kontrak tidak dapat dihapus.
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
