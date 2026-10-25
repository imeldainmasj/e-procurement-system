import type { ColumnDef } from '@tanstack/react-table';
import { MessageSquarePlus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PROCUREMENT_METHOD_LABELS,
  PROCUREMENT_METHODS,
  PROCUREMENT_TYPE_LABELS,
  PROCUREMENT_TYPES,
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_LABELS,
  WORK_STATUS_LABELS,
  WORK_STATUSES,
  type WorkListItemDto,
} from '@sipita/shared';
import { Can } from '@/components/auth/Can';
import { CurrentStages } from '@/components/ui/CurrentStages';
import { DataIssueBadge } from '@/components/ui/DataIssueBadge';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useListParams } from '@/hooks/useListParams';
import { useUserOptions } from '@/hooks/useMasterData';
import { useSettings } from '@/hooks/useSettings';
import { useWorks } from '@/hooks/useWorks';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import { UpdateProgressModal } from './components/UpdateProgressModal';
import { WorkFormModal } from './components/WorkFormModal';

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: thisYear - 2015 + 2 }, (_, i) => thisYear + 1 - i);

export function WorkListPage({ mine = false }: { mine?: boolean }) {
  const [params, setParams] = useListParams({ sort: 'lastUpdatedAt:desc' });
  const works = useWorks(params, mine);
  const users = useUserOptions();
  const settings = useSettings();
  const staleDays = settings.data?.STALE_WORK_DAYS;
  const [creating, setCreating] = useState(false);
  const [progressFor, setProgressFor] = useState<WorkListItemDto | null>(null);

  const columns = useMemo<ColumnDef<WorkListItemDto>[]>(
    () => [
      {
        id: 'code',
        header: 'Pekerjaan',
        enableSorting: true,
        cell: ({ row: { original: w } }) => (
          <div className="min-w-56">
            <Link to={`/pekerjaan/${w.id}`} className="link link-hover font-medium">
              {w.title}
            </Link>
            <div className="text-base-content/60 flex flex-wrap items-center gap-x-2 text-xs">
              <span className="font-mono">{w.code}</span>
              <span>{PROCUREMENT_METHOD_LABELS[w.method]}</span>
              <span>{PROCUREMENT_TYPE_LABELS[w.procurementType]}</span>
            </div>
          </div>
        ),
      },
      {
        id: 'procurementYear',
        header: 'Tahun',
        enableSorting: true,
        cell: ({ row }) => row.original.procurementYear,
      },
      ...(mine
        ? []
        : [
            {
              id: 'pic.name',
              header: 'PIC',
              enableSorting: true,
              cell: ({ row }) => row.original.pic.name,
            } satisfies ColumnDef<WorkListItemDto>,
          ]),
      {
        id: 'vendor.name',
        header: 'Vendor',
        enableSorting: true,
        cell: ({ row }) => row.original.vendor?.name ?? '-',
      },
      {
        id: 'amountIdr',
        header: 'Nilai (IDR)',
        enableSorting: true,
        cell: ({ row: { original: w } }) => (
          <div className="text-right whitespace-nowrap">
            <div>{formatCurrency(w.amountIdr)}</div>
            {w.currency !== 'IDR' && (
              <div className="text-base-content/60 text-xs">
                {w.currency} {w.amount.toLocaleString('id-ID')}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'stages',
        header: 'Tahapan Saat Ini',
        cell: ({ row }) => <CurrentStages work={row.original} />,
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ row: { original: w } }) => (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={w.status} kind="work" />
            <DataIssueBadge issues={w.issues} stale={w.isStale} staleDays={staleDays} />
          </div>
        ),
      },
      {
        id: 'lastUpdatedAt',
        header: 'Update Terakhir',
        enableSorting: true,
        cell: ({ row: { original: w } }) => (
          <span className={`whitespace-nowrap ${w.isStale ? 'text-warning' : ''}`}>
            {formatDate(w.lastUpdatedAt)}
          </span>
        ),
      },
      ...(mine
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }) => (
                <button
                  type="button"
                  className="btn btn-xs btn-soft btn-primary whitespace-nowrap"
                  onClick={() => setProgressFor(row.original)}
                >
                  <MessageSquarePlus className="size-3" /> Update progres
                </button>
              ),
            } satisfies ColumnDef<WorkListItemDto>,
          ]
        : []),
    ],
    [mine, staleDays],
  );

  const select = (key: string, label: string, options: [string, string][]) => (
    <select
      className="select select-sm w-auto"
      value={String(params[key] ?? '')}
      onChange={(e) => setParams({ [key]: e.target.value || undefined })}
      aria-label={`Filter ${label.toLowerCase()}`}
    >
      <option value="">{label}</option>
      {options.map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <PageHeader
        title={mine ? 'Pekerjaan Saya' : 'Semua Pekerjaan'}
        description={
          mine
            ? 'Pekerjaan dengan Anda sebagai PIC. Catat setiap progres agar tim dan manager selalu terkini.'
            : 'Seluruh data pengadaan software & lisensi IT SAPM sejak 2015.'
        }
        actions={
          <Can feature="WORK" action="create">
            <button
              type="button"
              className="btn btn-soft btn-secondary btn-sm"
              onClick={() => setCreating(true)}
            >
              <Plus className="size-4" /> Tambah Pekerjaan
            </button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={works.data?.data}
        total={works.data?.meta.total ?? 0}
        params={params}
        onParamsChange={setParams}
        isLoading={works.isPending}
        isFetching={works.isFetching}
        error={works.error}
        searchPlaceholder="Cari kode, judul, atau vendor..."
        getRowId={(w) => w.id}
        emptyTitle={mine ? 'Belum ada pekerjaan dengan Anda sebagai PIC' : undefined}
        filters={
          <>
            {select(
              'year',
              'Semua tahun',
              YEARS.map((y) => [String(y), String(y)]),
            )}
            {select(
              'method',
              'Semua metode',
              PROCUREMENT_METHODS.map((m) => [m, PROCUREMENT_METHOD_LABELS[m]]),
            )}
            {select(
              'procurementType',
              'Semua jenis',
              PROCUREMENT_TYPES.map((t) => [t, PROCUREMENT_TYPE_LABELS[t]]),
            )}
            {select(
              'category',
              'BAU & Project',
              PROJECT_CATEGORIES.map((c) => [c, PROJECT_CATEGORY_LABELS[c]]),
            )}
            {select(
              'status',
              'Semua status',
              WORK_STATUSES.map((s) => [s, WORK_STATUS_LABELS[s]]),
            )}
            {!mine &&
              select(
                'picId',
                'Semua PIC',
                (users.data ?? []).map((u) => [u.id, u.name]),
              )}
            {select('hasIssues', 'Kelengkapan data', [
              ['true', 'Perlu dicek'],
              ['false', 'Lengkap'],
            ])}
            {select('stale', 'Semua update', [
              ['true', `Tidak di-update > ${staleDays ?? 7} hari`],
            ])}
          </>
        }
      />
      {creating && <WorkFormModal work={null} onClose={() => setCreating(false)} />}
      {progressFor && (
        <UpdateProgressModal
          workId={progressFor.id}
          workTitle={progressFor.title}
          milestones={null}
          onClose={() => setProgressFor(null)}
        />
      )}
    </>
  );
}
