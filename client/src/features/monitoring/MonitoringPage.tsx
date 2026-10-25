import { ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  EXECUTOR_LABELS,
  JOB_LEVEL_LABELS,
  type BoardColumnDto,
  type TeamMemberDto,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { CurrentStages } from '@/components/ui/CurrentStages';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useBoard, useStaffWorks, useTeam } from '@/hooks/useDashboard';
import { useSettings } from '@/hooks/useSettings';
import { cn } from '@/utils/cn';
import { formatDate, formatDateTime } from '@/utils/formatDate';

const HEAD = 'bg-base-200/60 text-base-content/60 text-xs uppercase';
const daysAgo = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);

function StaffWorks({ member, onClose }: { member: TeamMemberDto; onClose: () => void }) {
  const query = useStaffWorks(member.user.id);
  return (
    <SectionCard
      title={`Pekerjaan ${member.user.name}`}
      description="Pekerjaan aktif & ditunda, tahapan saat ini, dan catatan progres terakhir"
      flush
      actions={
        <button type="button" className="btn btn-ghost btn-xs" onClick={onClose} aria-label="Tutup">
          <X className="size-4" />
        </button>
      }
    >
      {query.isPending ? (
        <div className="skeleton m-4 h-32" />
      ) : query.isError ? (
        <div role="alert" className="alert alert-error m-4">
          <span>{getErrorMessage(query.error)}</span>
        </div>
      ) : query.data.works.length === 0 ? (
        <EmptyState title="Tidak ada pekerjaan aktif" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-sm table">
            <thead className={HEAD}>
              <tr>
                <th>Pekerjaan</th>
                <th>Tahapan Saat Ini</th>
                <th>Update Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {query.data.works.map((w) => (
                <tr key={w.id} className="hover:bg-base-200/40 align-top">
                  <td className="min-w-56">
                    <Link to={`/pekerjaan/${w.id}`} className="link link-hover font-medium">
                      {w.title}
                    </Link>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-base-content/60 font-mono">{w.code}</span>
                      {w.status !== 'ACTIVE' && <StatusBadge status={w.status} kind="work" />}
                    </div>
                  </td>
                  <td>
                    <CurrentStages work={w} />
                  </td>
                  <td className="min-w-64">
                    <div className={cn('text-xs', w.isStale && 'text-warning font-medium')}>
                      {formatDateTime(w.lastUpdatedAt)} ({daysAgo(w.lastUpdatedAt)} hari lalu)
                    </div>
                    {w.lastUpdate && (
                      <p className="text-sm">
                        {w.lastUpdate.note}{' '}
                        <span className="text-base-content/60 text-xs">
                          — {w.lastUpdate.author}
                        </span>
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function TeamTab() {
  const team = useTeam();
  const [selected, setSelected] = useState<TeamMemberDto | null>(null);
  const settings = useSettings();

  if (team.isPending) return <div className="skeleton h-64" />;
  if (team.isError) {
    return (
      <div role="alert" className="alert alert-error">
        <span>{getErrorMessage(team.error)}</span>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <SectionCard title="Per Staff" description="Klik baris untuk melihat pekerjaannya" flush>
        <div className="overflow-x-auto">
          <table className="table-sm table">
            <thead className={HEAD}>
              <tr>
                <th>Staff</th>
                <th className="text-right">Aktif</th>
                <th className="text-right">Ditunda</th>
                <th className="text-right">Selesai</th>
                <th className="text-right">&gt; {settings.data?.STALE_WORK_DAYS ?? 7} hari</th>
                <th>Update Terakhir</th>
                <th>Terlama Tanpa Update</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {team.data.map((m) => (
                <tr
                  key={m.user.id}
                  className={cn(
                    'hover:bg-base-200/40 cursor-pointer',
                    selected?.user.id === m.user.id && 'bg-primary/5',
                  )}
                  onClick={() => setSelected(m)}
                >
                  <td>
                    <div className="font-medium">{m.user.name}</div>
                    <div className="text-base-content/60 text-xs">
                      {JOB_LEVEL_LABELS[m.user.jobLevel]}
                    </div>
                  </td>
                  <td className="text-right tabular-nums">{m.active}</td>
                  <td className="text-right tabular-nums">{m.onHold}</td>
                  <td className="text-right tabular-nums">{m.completed}</td>
                  <td
                    className={cn(
                      'text-right tabular-nums',
                      m.stale > 0 && 'text-warning font-semibold',
                    )}
                  >
                    {m.stale}
                  </td>
                  <td className="whitespace-nowrap">{formatDate(m.lastUpdateAt)}</td>
                  <td>
                    {m.oldestWithoutUpdate ? (
                      <div className="max-w-64">
                        <div className="truncate">{m.oldestWithoutUpdate.title}</div>
                        <div className="text-base-content/60 text-xs">
                          {daysAgo(m.oldestWithoutUpdate.lastUpdatedAt)} hari tanpa update
                        </div>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <ChevronRight className="text-base-content/40 size-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
      {selected && <StaffWorks member={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

type BoardFilter = 'all' | 'outside' | 'it';

function BoardTab() {
  const board = useBoard(true);
  const [filter, setFilter] = useState<BoardFilter>('all');

  if (board.isPending) return <div className="skeleton h-96" />;
  if (board.isError) {
    return (
      <div role="alert" className="alert alert-error">
        <span>{getErrorMessage(board.error)}</span>
      </div>
    );
  }
  const columns = board.data.filter(
    (c: BoardColumnDto) =>
      filter === 'all' || (filter === 'outside' ? c.executor !== 'IT' : c.executor === 'IT'),
  );
  const count = (pred: (c: BoardColumnDto) => boolean) =>
    board.data.filter(pred).reduce((n, c) => n + c.works.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['all', `Semua (${count(() => true)})`],
            ['it', `Tertahan di IT (${count((c) => c.executor === 'IT')})`],
            ['outside', `Menunggu pihak luar IT (${count((c) => c.executor !== 'IT')})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={cn(
              'btn btn-sm',
              filter === key ? 'btn-secondary' : 'btn-soft btn-secondary',
            )}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
        <span className="text-base-content/60 text-xs">
          Pekerjaan dengan tahapan paralel muncul di lebih dari satu kolom.
        </span>
      </div>
      {columns.length === 0 ? (
        <EmptyState title="Tidak ada pekerjaan aktif" />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {columns.map((col) => (
            <section
              key={col.type}
              className="bg-base-200/60 w-72 shrink-0 rounded p-2"
              aria-label={col.label}
            >
              <header className="mb-2 flex items-center justify-between px-1">
                <div>
                  <h3 className="text-sm font-semibold">{col.label}</h3>
                  <span
                    className={cn(
                      'badge badge-xs badge-soft',
                      col.executor === 'IT' ? 'badge-primary' : 'badge-info',
                    )}
                  >
                    {col.executor === 'IT' ? 'Di IT' : `Menunggu ${EXECUTOR_LABELS[col.executor]}`}
                  </span>
                </div>
                <span className="badge badge-sm">{col.works.length}</span>
              </header>
              <ul className="space-y-2">
                {col.works.map((w) => (
                  <li
                    key={w.id}
                    className={cn('card p-3', w.isStale && 'border-warning border-l-4')}
                  >
                    <Link to={`/pekerjaan/${w.id}`} className="link link-hover text-sm font-medium">
                      {w.title}
                    </Link>
                    <div className="text-base-content/60 mt-1 flex flex-wrap justify-between gap-1 text-xs">
                      <span>{w.pic.name}</span>
                      <span className={cn(w.isStale && 'text-warning font-medium')}>
                        {daysAgo(w.lastUpdatedAt)} hari lalu
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function MonitoringPage() {
  const [tab, setTab] = useState<'team' | 'board'>('team');
  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoring Tim"
        description="Posisi dan progres pekerjaan setiap staff IT SAPM."
      />
      <div role="tablist" className="tabs tabs-border">
        {(
          [
            ['team', 'Per Staff'],
            ['board', 'Papan Tahapan'],
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
      {tab === 'team' ? <TeamTab /> : <BoardTab />}
    </div>
  );
}
