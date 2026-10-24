import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PK_RESULT_LABELS,
  type AddendumDto,
  type WorkDetailDto,
  type WorkDocumentsDto,
} from '@sipita/shared';
import { agreementsApi } from '@/api/documents.api';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermission } from '@/hooks/usePermission';
import { formatDate } from '@/utils/formatDate';
import { AddendumForm } from '@/features/agreements/components/AddendumForm';
import { AgreementForm } from '@/features/agreements/components/AgreementForm';
import { AddButton, Empty, RowActions } from './common';
import { formatMoney, TABLE_HEAD, useDeleteDialog, useDocumentAccess } from './helpers';

/** Agreements produced by the work and, for PK with result Addendum, its addendums. */
export function AgreementTab({ work, docs }: { work: WorkDetailDto; docs: WorkDocumentsDto }) {
  const { canWrite, canDelete } = useDocumentAccess(work);
  const { can } = usePermission();
  const canAgreement = canWrite && can('AGREEMENT', 'create');
  const [creating, setCreating] = useState(false);
  const [addendum, setAddendum] = useState<AddendumDto | 'new' | null>(null);
  const { confirmDelete, dialog } = useDeleteDialog();

  const isPk = work.method === 'SPECIAL_EXTENSION';
  const wantsAddendum = isPk && work.pkResult === 'ADDENDUM';
  const source = work.sourceAgreement;

  return (
    <div className="space-y-4 p-4">
      {isPk && (
        <div
          role="note"
          className={`alert alert-soft text-sm ${work.pkResult ? '' : 'alert-warning'}`}
        >
          {work.pkResult
            ? `Hasil PK: ${PK_RESULT_LABELS[work.pkResult]}.`
            : 'Pilih hasil PK (Addendum atau Agreement baru) di data pekerjaan sebelum mencatat dokumen akhir.'}
        </div>
      )}

      {!wantsAddendum && (
        <>
          {canAgreement && (!isPk || work.pkResult) && (
            <div className="flex justify-end">
              <AddButton label="Catat Agreement" onClick={() => setCreating(true)} />
            </div>
          )}
          {docs.agreements.length === 0 ? (
            <Empty>Belum ada agreement.</Empty>
          ) : (
            <table className="table-sm table">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th>No. Agreement</th>
                  <th>Periode</th>
                  <th className="text-right">Nilai</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {docs.agreements.map((a) => (
                  <tr key={a.id} className="hover:bg-base-200/40">
                    <td>
                      <Link to={`/kontrak/${a.id}`} className="link link-hover font-mono">
                        {a.agreementNo}
                      </Link>
                      <div>{a.title}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      {formatDate(a.periodStart)} – {formatDate(a.effectivePeriodEnd)}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {formatMoney(a.amount, a.currency)}
                    </td>
                    <td>
                      <StatusBadge status={a.status} kind="agreement" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {wantsAddendum && source && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              Kontrak sumber:{' '}
              <Link to={`/kontrak/${source.id}`} className="link link-primary font-mono">
                {source.agreementNo}
              </Link>{' '}
              (s.d. {formatDate(source.periodEnd)})
            </p>
            {canWrite && can('AGREEMENT', 'update') && (
              <AddButton label="Catat Addendum" onClick={() => setAddendum('new')} />
            )}
          </div>
          {docs.addendums.length === 0 ? (
            <Empty>Belum ada addendum.</Empty>
          ) : (
            <table className="table-sm table">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th>No. Addendum</th>
                  <th>Tanggal</th>
                  <th>Selesai Baru</th>
                  <th className="text-right">Perubahan Nilai</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {docs.addendums.map((ad) => (
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
                      <RowActions
                        label={ad.addendumNo}
                        onEdit={canWrite ? () => setAddendum(ad) : undefined}
                        onDelete={
                          canDelete
                            ? () =>
                                confirmDelete(`Addendum ${ad.addendumNo}`, () =>
                                  agreementsApi.deleteAddendum(ad.agreement.id, ad.id),
                                )
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {creating && (
        <AgreementForm
          workId={work.id}
          agreement={null}
          defaults={{
            title: `Perjanjian ${work.title}`,
            agreementType: work.procurementType === 'RENEWAL_LICENSE' ? 'RENEWAL' : 'NEW',
            vendorId: work.vendor?.id ?? '',
            picId: work.pic.id,
            periodStart: work.periodStart ?? '',
            periodEnd: work.periodEnd ?? '',
            amount: work.amount,
            currency: work.currency,
            exchangeRate: work.exchangeRate,
            poId: docs.purchaseOrders.find((po) => !po.agreement)?.id ?? '',
          }}
          onClose={() => setCreating(false)}
        />
      )}
      {addendum && source && (
        <AddendumForm
          agreement={source}
          workId={work.id}
          addendum={addendum === 'new' ? null : addendum}
          onClose={() => setAddendum(null)}
        />
      )}
      {dialog}
    </div>
  );
}
