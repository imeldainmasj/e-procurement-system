import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AGREEMENT_STATUS_LABELS, AGREEMENT_STATUSES, type AgreementDto } from '@sipita/shared';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAgreements } from '@/hooks/useDocuments';
import { useListParams } from '@/hooks/useListParams';
import { formatDate } from '@/utils/formatDate';
import { cn } from '@/utils/cn';
import { formatMoney } from '@/features/works/documents/helpers';

/** Remaining days until the (effective) end date, coloured by urgency. */
export function Countdown({ agreement: a }: { agreement: AgreementDto }) {
  if (a.status === 'TERMINATED')
    return <span className="text-base-content/50 text-xs">Diakhiri</span>;
  if (a.daysLeft < 0) {
    return <span className="text-error text-xs">Berakhir {-a.daysLeft} hari lalu</span>;
  }
  const tone =
    a.daysLeft <= 30 ? 'text-error' : a.daysLeft <= 90 ? 'text-warning' : 'text-base-content/60';
  return <span className={cn('text-xs font-medium', tone)}>{a.daysLeft} hari lagi</span>;
}

const WINDOWS = [
  [undefined, 'Semua'],
  [30, '≤ 30 hari'],
  [60, '≤ 60 hari'],
  [90, '≤ 90 hari'],
] as const;

export function AgreementListPage() {
  const [params, setParams] = useListParams({ sort: 'periodEnd:asc' });
  const agreements = useAgreements(params);

  const columns = useMemo<ColumnDef<AgreementDto>[]>(
    () => [
      {
        id: 'agreementNo',
        header: 'Agreement',
        enableSorting: true,
        cell: ({ row: { original: a } }) => (
          <div className="min-w-56">
            <Link to={`/kontrak/${a.id}`} className="link link-hover font-mono text-sm">
              {a.agreementNo}
            </Link>
            <div>{a.title}</div>
            {a.addendums.length > 0 && (
              <div className="text-base-content/60 text-xs">{a.addendums.length} addendum</div>
            )}
          </div>
        ),
      },
      {
        id: 'vendor.name',
        header: 'Vendor',
        enableSorting: true,
        cell: ({ row }) => row.original.vendor.name,
      },
      {
        id: 'work',
        header: 'Pekerjaan',
        cell: ({ row }) => (
          <Link
            to={`/pekerjaan/${row.original.work.id}`}
            className="link link-hover font-mono text-xs"
          >
            {row.original.work.code}
          </Link>
        ),
      },
      {
        id: 'periodEnd',
        header: 'Berakhir',
        enableSorting: true,
        cell: ({ row: { original: a } }) => (
          <div className="whitespace-nowrap">
            <div>{formatDate(a.effectivePeriodEnd)}</div>
            <Countdown agreement={a} />
          </div>
        ),
      },
      {
        id: 'amountIdr',
        header: 'Nilai',
        enableSorting: true,
        cell: ({ row: { original: a } }) => (
          <div className="text-right whitespace-nowrap">{formatMoney(a.amount, a.currency)}</div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} kind="agreement" />,
      },
      { id: 'pic', header: 'PIC', cell: ({ row }) => row.original.pic.name },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Kontrak"
        description="Agreement & addendum beserta hitung mundur jatuh tempo."
        actions={
          <div className="join">
            {WINDOWS.map(([days, label]) => (
              <button
                key={label}
                type="button"
                className={cn(
                  'join-item btn btn-sm',
                  params.expiringWithin === days ? 'btn-secondary' : 'btn-soft btn-secondary',
                )}
                onClick={() => setParams({ expiringWithin: days })}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />
      <DataTable
        columns={columns}
        data={agreements.data?.data}
        total={agreements.data?.meta.total ?? 0}
        params={params}
        onParamsChange={setParams}
        isLoading={agreements.isPending}
        isFetching={agreements.isFetching}
        error={agreements.error}
        searchPlaceholder="Cari no. agreement, judul, vendor..."
        getRowId={(a) => a.id}
        filters={
          <>
            <select
              className="select select-sm w-auto"
              value={String(params.status ?? '')}
              onChange={(e) => setParams({ status: e.target.value || undefined })}
              aria-label="Filter status"
            >
              <option value="">Semua status</option>
              {AGREEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {AGREEMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <label className="label text-sm">
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-primary"
                checked={params.mine === true || params.mine === 'true'}
                onChange={(e) => setParams({ mine: e.target.checked || undefined })}
              />
              Kontrak saya
            </label>
          </>
        }
      />
    </>
  );
}
