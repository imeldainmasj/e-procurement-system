import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatNpwp } from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { Can } from '@/components/auth/Can';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { vendorHooks } from '@/hooks/useVendors';
import { useWorks } from '@/hooks/useWorks';
import { toast } from '@/stores/toastStore';
import { formatCurrency } from '@/utils/formatCurrency';
import { VendorFormModal } from './components/VendorFormModal';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-base-content/60 text-xs">{label}</dt>
      <dd className="font-medium break-words">{children || '-'}</dd>
    </div>
  );
}

/** Latest 50 works of the vendor, newest procurement year first. */
function VendorWorks({ vendorId }: { vendorId: string }) {
  const works = useWorks({ page: 1, limit: 50, vendorId, sort: 'procurementYear:desc' });
  if (works.isPending) return <div className="skeleton m-4 h-32" />;
  if (!works.data?.data.length) return <EmptyState title="Belum ada pekerjaan dengan vendor ini" />;
  return (
    <div className="overflow-x-auto">
      <table className="table-sm table">
        <thead className="bg-base-200/60 text-base-content/60 text-xs uppercase">
          <tr>
            <th>Tahun</th>
            <th>Pekerjaan</th>
            <th className="text-right">Nilai (IDR)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {works.data.data.map((w) => (
            <tr key={w.id} className="hover:bg-base-200/40">
              <td>{w.procurementYear}</td>
              <td>
                <Link to={`/pekerjaan/${w.id}`} className="link link-hover">
                  {w.title}
                </Link>
                <div className="text-base-content/60 font-mono text-xs">{w.code}</div>
              </td>
              <td className="text-right whitespace-nowrap">{formatCurrency(w.amountIdr)}</td>
              <td>
                <StatusBadge status={w.status} kind="work" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
          flush
          actions={
            <span className="badge badge-soft badge-primary">
              {vendor.workCount} pekerjaan · {vendor.agreementCount} kontrak
            </span>
          }
        >
          <VendorWorks vendorId={vendor.id} />
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
