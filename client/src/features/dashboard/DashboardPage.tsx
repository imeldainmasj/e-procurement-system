import {
  Briefcase,
  CalendarClock,
  CircleCheck,
  Clock,
  Hourglass,
  PauseCircle,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  EXECUTOR_LABELS,
  formatRupiah,
  type AgreementBriefDto,
  type ManagerDashboardDto,
  type StaffDashboardDto,
  type WorkBriefDto,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { BarList } from '@/components/charts/BarList';
import { formatRupiahShort } from '@/components/charts/chartColors';
import { YearValueChart } from '@/components/charts/YearValueChart';
import { CurrentStages } from '@/components/ui/CurrentStages';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { StatCard } from '@/components/ui/StatCard';
import { useManagerDashboard, useStaffDashboard } from '@/hooks/useDashboard';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatDate';

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

function WorkRows({
  works,
  empty,
  showPic,
}: {
  works: WorkBriefDto[];
  empty: string;
  showPic?: boolean;
}) {
  if (works.length === 0) return <EmptyState title={empty} />;
  return (
    <ul className="divide-base-300 divide-y">
      {works.map((w) => (
        <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <Link to={`/pekerjaan/${w.id}`} className="link link-hover font-medium">
              {w.title}
            </Link>
            <div className="text-base-content/60 text-xs">
              <span className="font-mono">{w.code}</span>
              {showPic && ` · ${w.pic.name}`} · update {daysAgo(w.lastUpdatedAt)} hari lalu
            </div>
          </div>
          <CurrentStages work={w} />
        </li>
      ))}
    </ul>
  );
}

function AgreementRows({ agreements }: { agreements: AgreementBriefDto[] }) {
  if (agreements.length === 0) return <EmptyState title="Tidak ada kontrak yang akan berakhir" />;
  return (
    <ul className="divide-base-300 divide-y">
      {agreements.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <Link to={`/kontrak/${a.id}`} className="link link-hover font-medium">
              {a.title}
            </Link>
            <div className="text-base-content/60 text-xs">
              <span className="font-mono">{a.agreementNo}</span> · {a.vendorName} · s.d.{' '}
              {formatDate(a.effectivePeriodEnd)}
            </div>
          </div>
          <span
            className={cn(
              'badge badge-sm badge-soft whitespace-nowrap',
              a.daysLeft <= 30 ? 'badge-error' : 'badge-warning',
            )}
          >
            {a.daysLeft} hari lagi
          </span>
        </li>
      ))}
    </ul>
  );
}

function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-1', up ? 'text-success' : 'text-error')}>
      <Icon className="size-4" aria-hidden />
      {up ? '+' : ''}
      {pct.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
      <span className="sr-only">dibanding tahun lalu</span>
    </span>
  );
}

function Loading() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton h-32" />
      ))}
      <div className="skeleton h-80 sm:col-span-2 xl:col-span-4" />
    </div>
  );
}

function ErrorAlert({ error }: { error: unknown }) {
  return (
    <div role="alert" className="alert alert-error">
      <span>{getErrorMessage(error)}</span>
    </div>
  );
}

// ─── Manager ─────────────────────────────────────────────────────────────────

function ManagerView({ data: d }: { data: ManagerDashboardDto }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pekerjaan Aktif"
          value={d.kpi.active}
          description={`${d.kpi.onHold} ditunda · ${d.kpi.stale} tidak di-update > ${d.staleDays} hari`}
          icon={Briefcase}
          tone="primary"
          to="/pekerjaan?status=ACTIVE"
          linkLabel="Lihat pekerjaan aktif"
        />
        <StatCard
          label={`Selesai ${d.year}`}
          value={d.kpi.completedThisYear}
          icon={CircleCheck}
          tone="success"
          to={`/pekerjaan?status=COMPLETED&year=${d.year}`}
          linkLabel="Lihat yang selesai"
        />
        <StatCard
          label={`Nilai Pengadaan ${d.year}`}
          value={formatRupiahShort(d.kpi.valueThisYear)}
          description={formatRupiah(d.kpi.valueThisYear)}
          trend={<Trend current={d.kpi.valueThisYear} previous={d.kpi.valueLastYear} />}
          icon={Wallet}
          tone="warning"
          to={`/pekerjaan?year=${d.year}`}
          linkLabel="Lihat rinciannya"
        />
        <StatCard
          label={`Kontrak ≤ ${d.reminderWindow} Hari`}
          value={d.kpi.expiringAgreements}
          icon={CalendarClock}
          tone="error"
          to={`/kontrak?expiringWithin=${d.reminderWindow}`}
          linkLabel="Lihat kontrak"
        />
      </div>

      <SectionCard
        title="Nilai Pengadaan per Tahun"
        description="Klik batang untuk melihat pekerjaan pada tahun tersebut. Pekerjaan dibatalkan tidak dihitung."
      >
        {d.valueByYear.length === 0 ? (
          <EmptyState title="Belum ada data pengadaan" />
        ) : (
          <YearValueChart
            data={d.valueByYear}
            onSelectYear={(y) => navigate(`/pekerjaan?year=${y}`)}
          />
        )}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Sebaran per Tahapan"
          description="Tahapan saat ini dari pekerjaan aktif"
          actions={
            <Link to="/monitoring" className="btn btn-xs btn-soft btn-primary">
              Papan tahapan
            </Link>
          }
        >
          {d.stageDistribution.length === 0 ? (
            <EmptyState title="Tidak ada pekerjaan aktif" />
          ) : (
            <BarList
              ariaLabel="Jumlah pekerjaan aktif per tahapan"
              rows={d.stageDistribution.map((s) => ({
                key: s.type,
                label: s.label,
                hint: s.executor === 'IT' ? undefined : `menunggu ${EXECUTOR_LABELS[s.executor]}`,
                value: s.count,
              }))}
            />
          )}
        </SectionCard>
        <SectionCard
          title="Beban Kerja per Staff"
          description="Pekerjaan aktif per PIC"
          actions={
            <Link to="/monitoring" className="btn btn-xs btn-soft btn-primary">
              Monitoring Tim
            </Link>
          }
        >
          {d.workload.length === 0 ? (
            <EmptyState title="Tidak ada pekerjaan aktif" />
          ) : (
            <BarList
              ariaLabel="Jumlah pekerjaan aktif per staff"
              rows={d.workload.map((w) => ({
                key: w.user.id,
                label: w.user.name,
                hint: [w.onHold && `${w.onHold} ditunda`, w.stale && `${w.stale} tidak di-update`]
                  .filter(Boolean)
                  .join(' · '),
                value: w.active,
                display: `${w.active} aktif`,
              }))}
            />
          )}
        </SectionCard>
      </div>

      <SectionCard
        title={`Tidak Di-update > ${d.staleDays} Hari`}
        flush
        actions={<span className="badge badge-soft badge-warning">{d.kpi.stale}</span>}
      >
        <WorkRows works={d.stale} empty="Semua pekerjaan aktif ter-update" showPic />
      </SectionCard>
    </div>
  );
}

// ─── Staff ───────────────────────────────────────────────────────────────────

function StaffView({ data: d }: { data: StaffDashboardDto }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pekerjaan Aktif Saya"
          value={d.activeCount}
          icon={Briefcase}
          tone="primary"
          to="/pekerjaan/saya"
          linkLabel="Buka Pekerjaan Saya"
        />
        <StatCard label="Ditunda" value={d.onHoldCount} icon={PauseCircle} tone="secondary" />
        <StatCard
          label={`Belum Di-update > ${d.staleDays} Hari`}
          value={d.stale.length}
          icon={Clock}
          tone="warning"
        />
        <StatCard
          label="Menunggu Pihak Luar IT"
          value={d.waitingOutside.length}
          icon={Hourglass}
          tone="info"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title={`Perlu Update (> ${d.staleDays} hari)`} flush>
          <WorkRows works={d.stale} empty="Semua pekerjaan Anda ter-update" />
        </SectionCard>
        <SectionCard
          title="Menunggu Tim Lain / Direksi / Pejabat"
          description="Tahap berikutnya ada di luar IT; pantau dan catat hasilnya saat keluar"
          flush
        >
          <WorkRows works={d.waitingOutside} empty="Tidak ada yang menunggu pihak luar IT" />
        </SectionCard>
      </div>
      <SectionCard title={`Kontrak Saya yang Berakhir ≤ ${d.reminderWindow} Hari`} flush>
        <AgreementRows agreements={d.expiringAgreements} />
      </SectionCard>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function Tabs({
  value,
  onChange,
}: {
  value: 'team' | 'mine';
  onChange: (v: 'team' | 'mine') => void;
}) {
  const tab = (key: 'team' | 'mine', label: ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={value === key}
      className={cn(
        'join-item btn btn-sm',
        value === key ? 'btn-secondary' : 'btn-soft btn-secondary',
      )}
      onClick={() => onChange(key)}
    >
      {label}
    </button>
  );
  return (
    <div role="tablist" className="join">
      {tab('team', 'Tim')}
      {tab('mine', 'Saya')}
    </div>
  );
}

/** Staff see their own work; managers see the team, with a switch to their own view (§10). */
export function DashboardPage() {
  const { user, can } = usePermission();
  const canSeeTeam = can('MONITORING');
  const [view, setView] = useState<'team' | 'mine'>(canSeeTeam ? 'team' : 'mine');
  const manager = useManagerDashboard(canSeeTeam && view === 'team');
  const staff = useStaffDashboard();
  const showTeam = canSeeTeam && view === 'team';
  const query = showTeam ? manager : staff;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Halo, ${user?.name.split(' ')[0] ?? ''}`}
        description={
          showTeam
            ? 'Ringkasan pekerjaan dan pengadaan tim IT SAPM.'
            : 'Ringkasan pekerjaan Anda hari ini.'
        }
        actions={canSeeTeam ? <Tabs value={view} onChange={setView} /> : undefined}
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorAlert error={query.error} />
      ) : showTeam ? (
        <ManagerView data={manager.data!} />
      ) : (
        <StaffView data={staff.data!} />
      )}
    </div>
  );
}
