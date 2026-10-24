import { ArrowLeft, Ban, Pencil, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AGREEMENT_TYPE_LABELS } from '@sipita/shared';
import { agreementsApi } from '@/api/documents.api';
import { getErrorMessage } from '@/api/client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { SectionCard } from '@/components/ui/SectionCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAgreement, useDocumentMutation } from '@/hooks/useDocuments';
import { usePermission } from '@/hooks/usePermission';
import { toast } from '@/stores/toastStore';
import { formatDate } from '@/utils/formatDate';
import { formatMoney, TABLE_HEAD } from '@/features/works/documents/helpers';
import { Countdown } from './AgreementListPage';
import { AgreementForm } from './components/AgreementForm';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-base-content/60 text-xs">{label}</dt>
      <dd className="font-medium break-words">{children ?? '-'}</dd>
    </div>
  );
}

export function AgreementDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const query = useAgreement(id);
  const { can } = usePermission();
  const [dialog, setDialog] = useState<'edit' | 'delete' | 'terminate' | null>(null);
  const remove = useDocumentMutation((agreementId: string) => agreementsApi.remove(agreementId));
  const terminate = useDocumentMutation((agreementId: string) =>
    agreementsApi.terminate(agreementId),
  );

  if (query.isPending) return <div className="skeleton h-96 w-full" />;
  if (query.isError) {
    return (
      <div role="alert" className="alert alert-error">
        <span>{getErrorMessage(query.error)}</span>
        <Link to="/kontrak" className="btn btn-sm">
          Kembali
        </Link>
      </div>
    );
  }
  const a = query.data;
  const canEdit = a.canEdit && can('AGREEMENT', 'update');
  const extended = a.effectivePeriodEnd !== a.periodEnd;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/kontrak"
            className="text-base-content/60 mb-1 flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="size-3" /> Daftar kontrak
          </Link>
          <h1 className="text-lg font-semibold">{a.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{a.agreementNo}</span>
            <StatusBadge status={a.status} kind="agreement" />
            <Countdown agreement={a} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button
              type="button"
              className="btn btn-soft btn-primary btn-sm"
              onClick={() => setDialog('edit')}
            >
              <Pencil className="size-4" /> Ubah
            </button>
          )}
          {canEdit && a.status !== 'TERMINATED' && (
            <button
              type="button"
              className="btn btn-soft btn-warning btn-sm"
              onClick={() => setDialog('terminate')}
            >
              <Ban className="size-4" /> Akhiri Kontrak
            </button>
          )}
          {a.canEdit && can('AGREEMENT', 'delete') && (
            <button
              type="button"
              className="btn btn-soft btn-error btn-sm"
              onClick={() => setDialog('delete')}
            >
              <Trash2 className="size-4" /> Hapus
            </button>
          )}
        </div>
      </div>

      <SectionCard title="Ringkasan">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Tipe">{AGREEMENT_TYPE_LABELS[a.agreementType]}</Field>
          <Field label="Vendor">
            <Link to={`/vendor/${a.vendor.id}`} className="link link-hover">
              {a.vendor.name}
            </Link>
          </Field>
          <Field label="Nilai">{formatMoney(a.amount, a.currency)}</Field>
          <Field label="PIC">{a.pic.name}</Field>
          <Field label="Periode Awal">
            {formatDate(a.periodStart)} – {formatDate(a.periodEnd)}
          </Field>
          <Field label="Berakhir Efektif">
            {formatDate(a.effectivePeriodEnd)}
            {extended && (
              <div className="text-base-content/60 text-xs font-normal">diperpanjang addendum</div>
            )}
          </Field>
          <Field label="Pekerjaan">
            <Link to={`/pekerjaan/${a.work.id}`} className="link link-hover font-mono">
              {a.work.code}
            </Link>
          </Field>
          <Field label="PO">
            <span className="font-mono">{a.po.poNo}</span>
          </Field>
        </dl>
      </SectionCard>

      <SectionCard
        title="Addendum"
        flush
        description="Addendum dicatat dari pekerjaan Perpanjangan Khusus (hasil PK: Addendum)."
      >
        {a.addendums.length === 0 ? (
          <p className="text-base-content/60 py-6 text-center text-sm">Belum ada addendum.</p>
        ) : (
          <table className="table-sm table">
            <thead className={TABLE_HEAD}>
              <tr>
                <th>No. Addendum</th>
                <th>Tanggal</th>
                <th>Selesai Baru</th>
                <th className="text-right">Perubahan Nilai</th>
                <th>Pekerjaan PK</th>
              </tr>
            </thead>
            <tbody>
              {a.addendums.map((ad) => (
                <tr key={ad.id} className="hover:bg-base-200/40">
                  <td>
                    <div className="font-mono">{ad.addendumNo}</div>
                    <div>{ad.title}</div>
                  </td>
                  <td>{formatDate(ad.addendumDate)}</td>
                  <td>{formatDate(ad.newPeriodEnd)}</td>
                  <td className="text-right whitespace-nowrap">
                    {formatMoney(ad.valueChange, ad.currency)}
                  </td>
                  <td>
                    <Link
                      to={`/pekerjaan/${ad.work.id}`}
                      className="link link-hover font-mono text-xs"
                    >
                      {ad.work.code}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {a.extensions.length > 0 && (
        <SectionCard title="Perpanjangan Khusus dari kontrak ini">
          <ul className="list-disc ps-5 text-sm">
            {a.extensions.map((w) => (
              <li key={w.id}>
                <Link to={`/pekerjaan/${w.id}`} className="link link-hover">
                  {w.code} — {w.title}
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {dialog === 'edit' && (
        <AgreementForm workId={a.work.id} agreement={a} onClose={() => setDialog(null)} />
      )}
      <ConfirmModal
        open={dialog === 'terminate'}
        onClose={() => setDialog(null)}
        loading={terminate.isPending}
        variant="warning"
        title="Akhiri Kontrak"
        confirmLabel="Akhiri"
        message={
          <>
            Tandai <b>{a.agreementNo}</b> sebagai diakhiri? Ini hanya mencatat keputusan yang sudah
            diambil di luar sistem; pengingat jatuh tempo tidak dikirim lagi.
          </>
        }
        onConfirm={() =>
          terminate.mutate(a.id, {
            onSuccess: () => toast.success('Kontrak ditandai diakhiri'),
            onError: (err) => toast.error(getErrorMessage(err)),
            onSettled: () => setDialog(null),
          })
        }
      />
      <ConfirmModal
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        loading={remove.isPending}
        variant="error"
        title="Hapus Agreement"
        confirmLabel="Hapus"
        message={
          <>
            Hapus <b>{a.agreementNo}</b>? Milestone Agreement pada pekerjaan {a.work.code} kembali
            menjadi Berjalan.
          </>
        }
        onConfirm={() =>
          remove.mutate(a.id, {
            onSuccess: () => {
              toast.success('Agreement dihapus');
              navigate('/kontrak');
            },
            onError: (err) => toast.error(getErrorMessage(err)),
            onSettled: () => setDialog(null),
          })
        }
      />
    </div>
  );
}
