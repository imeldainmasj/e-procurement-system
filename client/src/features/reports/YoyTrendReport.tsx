import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatRupiah, type YoyTrendDto } from '@sipita/shared';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
import { useListParams } from '@/hooks/useListParams';
import { useReport } from '@/hooks/useReports';
import { cn } from '@/utils/cn';
import { LoadingOrError, ReportShell } from './ReportShell';

/** % change with icon + sign, never colour alone (Velzon: success = up, error = down). */
function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-base-content/50 text-xs">Baru</span>;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium tabular-nums',
        value > 0 ? 'text-success' : value < 0 ? 'text-error' : 'text-base-content/60',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {value > 0 ? '+' : ''}
      {value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%
    </span>
  );
}

/** Tren kenaikan year-to-year per lisensi/aplikasi (pekerjaan) atau per vendor. */
export function YoyTrendReport() {
  const [params, setParams] = useListParams({ groupBy: 'work' });
  const { page: _p, limit: _l, ...filters } = params;
  const report = useReport<YoyTrendDto>('yoy-trend', filters);
  const d = report.data;

  return (
    <ReportShell
      name="yoy-trend"
      title="Tren Year-to-Year"
      description="Kenaikan nilai dibanding pembelian tahun sebelumnya. Dasar PVP Forum dan perencanaan anggaran renewal."
      params={filters}
      onParamsChange={setParams}
      fields={['year', 'method', 'procurementType', 'category', 'vendor']}
      extraFilters={
        <div className="join">
          {(
            [
              ['work', 'Per pekerjaan'],
              ['vendor', 'Per vendor'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cn(
                'join-item btn btn-sm',
                params.groupBy === key ? 'btn-secondary' : 'btn-soft btn-secondary',
              )}
              onClick={() => setParams({ groupBy: key })}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {!d ? (
        <LoadingOrError isPending={report.isPending} error={report.error} />
      ) : (
        <SectionCard
          title={
            d.groupBy === 'work'
              ? `Renewal ${d.year} vs ${d.year - 1}`
              : `Total per vendor ${d.year} vs ${d.year - 1}`
          }
          description={
            d.groupBy === 'work'
              ? 'Pekerjaan yang punya nilai pembelian tahun sebelumnya, kenaikan terbesar di atas'
              : 'Jumlah nilai pengadaan per vendor'
          }
          flush
        >
          {d.rows.length === 0 ? (
            <EmptyState title="Tidak ada data pembanding untuk tahun ini" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-sm table">
                <thead className="bg-base-200/60 text-base-content/60 text-xs uppercase">
                  <tr>
                    <th>{d.groupBy === 'work' ? 'Pekerjaan' : 'Vendor'}</th>
                    <th className="text-right">{d.year - 1}</th>
                    <th className="text-right">{d.year}</th>
                    <th className="text-right">Kenaikan</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.key} className="hover:bg-base-200/40">
                      <td>
                        <Link
                          to={r.workId ? `/pekerjaan/${r.workId}` : `/vendor/${r.vendorId}`}
                          className="link link-hover font-medium"
                        >
                          {r.label}
                        </Link>
                        {r.sub && <div className="text-base-content/60 text-xs">{r.sub}</div>}
                      </td>
                      <td className="text-right whitespace-nowrap tabular-nums">
                        {r.previous === null ? '-' : formatRupiah(r.previous)}
                      </td>
                      <td className="text-right whitespace-nowrap tabular-nums">
                        {formatRupiah(r.current)}
                      </td>
                      <td className="text-right">
                        <Change value={r.increasePercent} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </ReportShell>
  );
}
