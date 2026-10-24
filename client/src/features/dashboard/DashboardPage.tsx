import {
  BadgeCheck,
  ClipboardList,
  ClipboardCheck,
  Clock,
  type LucideIcon,
  Minus,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  DASHBOARD_ANALYTICS_ROLES,
  formatRupiah,
  PR_STATUS_LABELS,
  PR_STATUSES,
  type DashboardSummaryDto,
  type SpendingGroup,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { BarList } from '@/components/charts/BarList';
import {
  axisProps,
  formatRupiahShort,
  gridProps,
  seriesColor,
} from '@/components/charts/chartColors';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { EmptyState } from '@/components/ui/EmptyState';
import { RatingStars } from '@/components/ui/RatingStars';
import { StatCard } from '@/components/ui/StatCard';
import {
  useDashboardSummary,
  useLeadTime,
  useSpending,
  useVendorPerformance,
} from '@/hooks/useDashboard';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatDate';
import { PrStatusBadge } from '../purchase-requests/components/PrBadges';

const thisYear = new Date().getFullYear();
const YEARS = [thisYear, thisYear - 1, thisYear - 2];

function Panel({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('card bg-base-100 shadow-sm', className)}>
      <div className="card-body gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="card-title text-base">{title}</h2>
            {description && <p className="text-base-content/60 text-xs">{description}</p>}
          </div>
          {actions}
        </div>
        {children}
      </div>
    </section>
  );
}

function QueryState({ error, pending }: { error: unknown; pending: boolean }) {
  if (pending) return <div className="skeleton h-48 w-full" />;
  return (
    <div role="alert" className="alert alert-error alert-soft text-sm">
      {getErrorMessage(error)}
    </div>
  );
}

/** Month-over-month change, with an icon and words so it never relies on colour. */
function SpendDelta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <>Belum ada belanja bulan lalu</>;
  const pct = Math.round(((current - previous) / previous) * 100);
  const Icon: LucideIcon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="size-3.5" aria-hidden />
      {pct === 0 ? 'Sama dengan' : `${pct > 0 ? 'Naik' : 'Turun'} ${Math.abs(pct)}% dari`} bulan
      lalu ({formatRupiah(previous)})
    </span>
  );
}

function KpiTiles({ summary }: { summary: DashboardSummaryDto }) {
  const { can } = usePermission();
  const s = summary.spending;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {s && (
        <>
          <StatCard
            label="Belanja Bulan Ini"
            icon={Wallet}
            value={formatRupiah(s.thisMonth)}
            description={
              <SpendDelta current={Number(s.thisMonth)} previous={Number(s.lastMonth)} />
            }
          />
          <StatCard
            label="Belanja Tahun Ini"
            icon={Wallet}
            value={formatRupiah(s.yearToDate)}
            description={`${s.purchaseOrdersThisMonth} PO terbit bulan ini · termasuk PPN`}
          />
        </>
      )}
      <StatCard
        label={summary.scope === 'own' ? 'Pengajuan Aktif Saya' : 'Pengajuan Aktif'}
        icon={ClipboardList}
        value={summary.activePrs}
        description="Sedang diproses, belum selesai"
        to="/pengajuan"
      />
      {summary.pendingMyApprovals !== null && (
        <StatCard
          label="Menunggu Persetujuan Saya"
          icon={BadgeCheck}
          value={summary.pendingMyApprovals}
          description={
            summary.pendingMyApprovals > 0 ? 'Buka inbox persetujuan' : 'Tidak ada antrean'
          }
          to="/persetujuan"
        />
      )}
      {summary.awaitingStockCheck !== null && (
        <StatCard
          label="Menunggu Cek Stok"
          icon={ClipboardCheck}
          value={summary.awaitingStockCheck}
          description="Pengajuan baru untuk dicek gudang"
          to="/pengajuan"
        />
      )}
      {(can('PROCUREMENT') || summary.pendingMyApprovals === null) && summary.scope === 'all' && (
        <StatCard
          label="Menunggu Penawaran"
          icon={ClipboardList}
          value={summary.awaitingQuotation}
          description="Disetujui, belum ada PO"
        />
      )}
      <StatCard
        label="PO Berjalan"
        icon={ShoppingCart}
        value={summary.openPurchaseOrders}
        description="Terbit, barang belum diterima lengkap"
        to={can('PROCUREMENT') ? '/purchase-order' : undefined}
      />
    </div>
  );
}

function MonthlySpending({ year }: { year: number }) {
  const query = useSpending('month', year);
  if (!query.data) return <QueryState error={query.error} pending={query.isPending} />;
  const rows = query.data.rows.map((r) => ({ ...r, value: Number(r.amount) }));
  const hasData = rows.some((r) => r.value > 0);

  return (
    <Panel
      title="Belanja per Bulan"
      description={`Total ${formatRupiah(query.data.total)} · PO terbit, termasuk PPN`}
      className="xl:col-span-2"
    >
      {hasData ? (
        <>
          <div className="h-64 w-full" role="img" aria-label={`Belanja per bulan tahun ${year}`}>
            <ResponsiveContainer>
              <BarChart
                data={rows}
                margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
                barCategoryGap="30%"
              >
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={56} tickFormatter={formatRupiahShort} />
                <Tooltip
                  cursor={{ fill: 'var(--chart-grid)' }}
                  content={<ChartTooltip formatValue={formatRupiah} />}
                />
                <Bar
                  dataKey="value"
                  name="Belanja"
                  fill={seriesColor(0)}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="text-sm">
            <summary className="text-base-content/70 cursor-pointer text-xs">Lihat tabel</summary>
            <table className="table table-xs mt-2">
              <thead>
                <tr>
                  <th>Bulan</th>
                  <th className="text-right">PO</th>
                  <th className="text-right">Belanja</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td className="text-right">{r.purchaseOrders}</td>
                    <td className="text-right">{formatRupiah(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <EmptyState title="Belum ada belanja" description={`Belum ada PO terbit pada ${year}.`} />
      )}
    </Panel>
  );
}

const BREAKDOWNS: [Exclude<SpendingGroup, 'month'>, string][] = [
  ['division', 'Divisi'],
  ['category', 'Kategori'],
  ['vendor', 'Vendor'],
];

function SpendingBreakdown({ year }: { year: number }) {
  const [group, setGroup] = useState<Exclude<SpendingGroup, 'month'>>('division');
  const query = useSpending(group, year);
  const total = Number(query.data?.total ?? 0);

  return (
    <Panel
      title="Komposisi Belanja"
      actions={
        <div role="tablist" className="tabs tabs-box tabs-xs">
          {BREAKDOWNS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={group === key}
              className={cn('tab', group === key && 'tab-active')}
              onClick={() => setGroup(key)}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {!query.data ? (
        <QueryState error={query.error} pending={query.isPending} />
      ) : query.data.rows.length === 0 ? (
        <EmptyState title="Belum ada belanja" />
      ) : (
        <BarList
          ariaLabel={`Belanja per ${group}`}
          rows={query.data.rows.slice(0, 8).map((r) => ({
            key: r.key,
            label: r.label,
            value: Number(r.amount),
            display: formatRupiahShort(Number(r.amount)),
            hint: total > 0 ? `${Math.round((Number(r.amount) / total) * 100)}%` : undefined,
          }))}
        />
      )}
    </Panel>
  );
}

function VendorPerformance({ year }: { year: number }) {
  const query = useVendorPerformance(year);
  return (
    <Panel
      title="Kinerja Vendor"
      description="Nilai PO tahun ini dan rata-rata rating dari Pengadaan"
      className="xl:col-span-2"
    >
      {!query.data ? (
        <QueryState error={query.error} pending={query.isPending} />
      ) : query.data.length === 0 ? (
        <EmptyState title="Belum ada PO" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Vendor</th>
                <th className="text-right">PO</th>
                <th className="text-right">Nilai</th>
                <th>Rating</th>
                <th className="text-right">Ketepatan Waktu</th>
              </tr>
            </thead>
            <tbody>
              {query.data.slice(0, 8).map((v) => (
                <tr key={v.vendor.id}>
                  <td>
                    <div className="font-medium">{v.vendor.name}</div>
                    <div className="text-base-content/60 font-mono text-xs">{v.vendor.code}</div>
                  </td>
                  <td className="text-right">{v.purchaseOrders}</td>
                  <td className="text-right whitespace-nowrap">{formatRupiah(v.amount)}</td>
                  <td>
                    <RatingStars value={v.rating} count={v.ratingCount || undefined} />
                  </td>
                  <td className="text-right">
                    {v.onTimeRating !== null
                      ? `${v.onTimeRating.toLocaleString('id-ID')} / 5`
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function LeadTime({ year }: { year: number }) {
  const query = useLeadTime(year);
  const days = (n: number | null) => (n === null ? '-' : `${n.toLocaleString('id-ID')} hari`);
  return (
    <Panel title="Lead Time Rata-rata" description={`Hari kalender, ${year}`}>
      {!query.data ? (
        <QueryState error={query.error} pending={query.isPending} />
      ) : (
        <dl className="divide-base-200 divide-y">
          {(
            [
              ['Pengajuan → barang diterima', query.data.submitToReceivedDays],
              ['Pengajuan → PO terbit', query.data.submitToPoDays],
              ['Durasi approval memo', query.data.approvalDays],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2 py-2">
              <dt className="text-base-content/70 flex items-center gap-2 text-sm">
                <Clock className="size-4 opacity-50" aria-hidden /> {label}
              </dt>
              <dd className="text-lg font-semibold tabular-nums">{days(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}

function PrStatusBreakdown({ summary }: { summary: DashboardSummaryDto }) {
  const rows = PR_STATUSES.filter((s) => (summary.prByStatus[s] ?? 0) > 0).map((status) => ({
    key: status,
    label: PR_STATUS_LABELS[status],
    value: summary.prByStatus[status] ?? 0,
  }));
  return (
    <Panel
      title={summary.scope === 'own' ? 'Pengajuan Saya per Status' : 'Pengajuan per Status'}
      description="Semua waktu"
    >
      {rows.length === 0 ? (
        <EmptyState title="Belum ada pengajuan" />
      ) : (
        <BarList ariaLabel="Jumlah pengajuan per status" rows={rows} />
      )}
    </Panel>
  );
}

function RecentPrs({ summary }: { summary: DashboardSummaryDto }) {
  return (
    <Panel
      title="Pengajuan Terbaru"
      actions={
        <Link to="/pengajuan" className="link link-hover text-sm">
          Lihat semua
        </Link>
      }
      className="xl:col-span-2"
    >
      {summary.recentPrs.length === 0 ? (
        <EmptyState title="Belum ada pengajuan" />
      ) : (
        <ul className="divide-base-200 divide-y">
          {summary.recentPrs.map((pr) => (
            <li key={pr.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <Link to={`/pengajuan/${pr.id}`} className="link link-hover font-medium">
                  {pr.title}
                </Link>
                <div className="text-base-content/60 text-xs">
                  {pr.number ?? 'Draft'} · {pr.requester.name} · {pr.division.name} ·{' '}
                  {formatDate(pr.createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums">{formatRupiah(pr.estimatedTotal)}</span>
                <PrStatusBadge status={pr.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { can } = usePermission();
  const analyst = can(...DASHBOARD_ANALYTICS_ROLES);
  const [year, setYear] = useState(thisYear);
  const summary = useDashboardSummary();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Selamat datang, {user?.name}</h1>
          <p className="text-base-content/70">{formatDate(new Date(), 'dddd, D MMMM YYYY')}</p>
        </div>
        {analyst && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-base-content/70">Tahun analisis</span>
            <select
              className="select select-sm w-auto"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!summary.data ? (
        <QueryState error={summary.error} pending={summary.isPending} />
      ) : (
        <KpiTiles summary={summary.data} />
      )}

      {analyst && (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <MonthlySpending year={year} />
            <SpendingBreakdown year={year} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <VendorPerformance year={year} />
            <LeadTime year={year} />
          </div>
        </>
      )}

      {summary.data && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <RecentPrs summary={summary.data} />
          <PrStatusBreakdown summary={summary.data} />
        </div>
      )}
    </div>
  );
}
