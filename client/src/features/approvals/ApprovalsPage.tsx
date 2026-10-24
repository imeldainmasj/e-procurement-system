import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/id';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  APPROVAL_STEP_STATUS_LABELS,
  type ApprovalInboxItemDto,
  formatRupiah,
} from '@sipita/shared';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApprovalInbox } from '@/hooks/useApprovals';
import { useListParams } from '@/hooks/useListParams';
import { useAuthStore } from '@/stores/authStore';
import { levelLabel } from '@/utils/approvalRule';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/formatDate';
import { PriorityBadge } from '../purchase-requests/components/PrBadges';
import { ApprovalDecisionDialogs, type DecisionTarget } from './ApprovalDecisionDialogs';

dayjs.extend(relativeTime);

type Tab = 'pending' | 'history';

export function ApprovalsPage() {
  const level = useAuthStore((s) => s.user?.approvalLevel ?? null);
  const [tab, setTab] = useState<Tab>('pending');
  const [params, setParams] = useListParams({ tab: 'pending' });
  const inbox = useApprovalInbox(params);
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);

  const switchTab = (next: Tab) => {
    setTab(next);
    setParams({ tab: next, sort: undefined, status: undefined });
  };

  const columns = useMemo<ColumnDef<ApprovalInboxItemDto>[]>(() => {
    const decide = (row: ApprovalInboxItemDto, m: 'approve' | 'reject') => {
      setTarget({
        stepId: row.id,
        level: row.level,
        prNumber: row.pr.number,
        prTitle: row.pr.title,
        total: row.pr.estimatedTotal,
      });
      setMode(m);
    };
    return [
      {
        id: 'memo.number',
        header: 'Pengajuan',
        enableSorting: true,
        cell: ({ row }) => (
          <Link to={`/pengajuan/${row.original.pr.id}`} className="link link-hover">
            <div className="font-medium">{row.original.pr.title}</div>
            <div className="text-base-content/60 font-mono text-xs">
              {row.original.pr.number} · {row.original.memo.number}
            </div>
          </Link>
        ),
      },
      {
        id: 'requester',
        header: 'Pemohon',
        cell: ({ row }) => (
          <div>
            <div>{row.original.pr.requester.name}</div>
            <div className="text-base-content/60 text-xs">{row.original.pr.division.name}</div>
          </div>
        ),
      },
      {
        id: 'memo.pr.estimatedTotal',
        header: 'Nilai',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatRupiah(row.original.pr.estimatedTotal)}</span>
        ),
      },
      {
        id: 'priority',
        header: 'Prioritas',
        cell: ({ row }) => <PriorityBadge priority={row.original.pr.priority} />,
      },
      {
        id: 'level',
        header: 'Level',
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {levelLabel(row.original.level)}
            <span className="text-base-content/60 text-xs">
              {' '}
              ({row.original.sequence}/{row.original.memo.totalLevels})
            </span>
          </span>
        ),
      },
      tab === 'pending'
        ? {
            id: 'pendingSince',
            header: 'Menunggu Sejak',
            enableSorting: true,
            cell: ({ row }) => {
              const since = row.original.pendingSince;
              const overdue = since !== null && dayjs().diff(since, 'day') >= 3;
              return (
                <span
                  className={cn('whitespace-nowrap', overdue && 'text-error font-medium')}
                  title={formatDateTime(since)}
                >
                  {since ? dayjs(since).locale('id').fromNow() : '-'}
                </span>
              );
            },
          }
        : {
            id: 'actedAt',
            header: 'Diputuskan',
            enableSorting: true,
            cell: ({ row }) => (
              <span className="whitespace-nowrap">{formatDateTime(row.original.actedAt)}</span>
            ),
          },
      tab === 'pending'
        ? {
            id: 'actions',
            header: '',
            cell: ({ row }) => (
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  className="btn btn-success btn-xs"
                  onClick={() => decide(row.original, 'approve')}
                >
                  <Check className="size-3" /> Setujui
                </button>
                <button
                  type="button"
                  className="btn btn-error btn-outline btn-xs"
                  onClick={() => decide(row.original, 'reject')}
                >
                  <X className="size-3" /> Tolak
                </button>
              </div>
            ),
          }
        : {
            id: 'decision',
            header: 'Keputusan',
            cell: ({ row }) => (
              <div className="max-w-xs">
                <StatusBadge
                  status={row.original.status}
                  label={APPROVAL_STEP_STATUS_LABELS[row.original.status]}
                />
                {row.original.comment && (
                  <div className="text-base-content/70 mt-1 text-xs">{row.original.comment}</div>
                )}
              </div>
            ),
          },
    ];
  }, [tab]);

  return (
    <>
      <PageHeader
        title="Persetujuan"
        description={
          level
            ? `Pengajuan yang menunggu keputusan Anda sebagai ${levelLabel(level)}.`
            : 'Akun Anda belum memiliki level approval. Hubungi Super Admin.'
        }
      />
      <div role="tablist" className="tabs tabs-border mb-4">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pending'}
          className={cn('tab', tab === 'pending' && 'tab-active')}
          onClick={() => switchTab('pending')}
        >
          Menunggu Keputusan
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={cn('tab', tab === 'history' && 'tab-active')}
          onClick={() => switchTab('history')}
        >
          Riwayat Keputusan
        </button>
      </div>
      <DataTable
        columns={columns}
        data={inbox.data?.data}
        total={inbox.data?.meta.total ?? 0}
        params={params}
        onParamsChange={setParams}
        isLoading={inbox.isPending}
        isFetching={inbox.isFetching}
        error={inbox.error}
        searchPlaceholder="Cari nomor PR, memo, atau judul..."
        emptyTitle={
          tab === 'pending'
            ? 'Tidak ada pengajuan yang menunggu keputusan Anda'
            : 'Belum ada keputusan'
        }
        getRowId={(s) => s.id}
      />
      <ApprovalDecisionDialogs
        target={target}
        mode={mode}
        onClose={() => {
          setMode(null);
          setTarget(null);
        }}
      />
    </>
  );
}
