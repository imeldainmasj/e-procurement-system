import { Link } from 'react-router-dom';
import { EXECUTOR_LABELS, JOB_LEVEL_LABELS, type TeamPerformanceDto } from '@sipita/shared';
import { BarList } from '@/components/charts/BarList';
import { seriesColor } from '@/components/charts/chartColors';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
import { useListParams } from '@/hooks/useListParams';
import { useReport } from '@/hooks/useReports';
import { LoadingOrError, ReportShell } from './ReportShell';
import { worksLink } from './worksLink';

const fmtDays = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 });

/** Share of days carried out by IT, as one bar on a neutral track (the rest is outside IT). */
function ItShare({ itDays, outsideDays }: { itDays: number; outsideDays: number }) {
  const total = itDays + outsideDays;
  if (total === 0) return <span className="text-base-content/40">-</span>;
  const pct = Math.round((itDays / total) * 100);
  return (
    <div
      className="flex min-w-40 items-center gap-2"
      title={`IT ${fmtDays(itDays)} hari · di luar IT ${fmtDays(outsideDays)} hari`}
    >
      <div className="bg-base-200 h-2 flex-1 overflow-hidden rounded-full" aria-hidden>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: seriesColor(0) }}
        />
      </div>
      <span className="w-10 text-right text-sm tabular-nums">{pct}%</span>
    </div>
  );
}

/** Beban & durasi per staf serta rata-rata lama tiap tahapan (IT vs di luar IT). */
export function TeamPerformanceReport() {
  const [params, setParams] = useListParams({ yearFrom: 2015 });
  const { page: _p, limit: _l, ...filters } = params;
  const report = useReport<TeamPerformanceDto>('team-performance', filters);
  const d = report.data;

  return (
    <ReportShell
      name="team-performance"
      title="Kinerja Tim"
      description="Jumlah pekerjaan per staf, keterlambatan update, dan lama tahapan yang dikerjakan IT dibanding pihak di luar IT."
      params={filters}
      onParamsChange={setParams}
      fields={['yearRange', 'method', 'procurementType', 'category']}
    >
      {!d ? (
        <LoadingOrError isPending={report.isPending} error={report.error} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <SectionCard
            title="Per Staf"
            description="Porsi IT = hari tahapan selesai yang dikerjakan IT dibanding total hari tahapan."
            className="xl:col-span-2"
            flush
          >
            {d.staff.length === 0 ? (
              <EmptyState title="Tidak ada data untuk filter ini" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-sm table">
                  <thead className="bg-base-200/60 text-base-content/60 text-xs uppercase">
                    <tr>
                      <th>Staf</th>
                      <th className="text-right">Aktif</th>
                      <th className="text-right">Selesai</th>
                      <th className="text-right">Tidak di-update</th>
                      <th>Porsi IT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.staff.map((s) => (
                      <tr key={s.user.id} className="hover:bg-base-200/40">
                        <td>
                          <div className="font-medium">{s.user.name}</div>
                          <div className="text-base-content/60 text-xs">
                            {JOB_LEVEL_LABELS[s.user.jobLevel]}
                          </div>
                        </td>
                        <td className="text-right tabular-nums">
                          <Link
                            className="link link-hover"
                            to={worksLink(filters, { picId: s.user.id, status: 'ACTIVE' })}
                          >
                            {s.active}
                          </Link>
                        </td>
                        <td className="text-right tabular-nums">{s.completed}</td>
                        <td className="text-right tabular-nums">
                          {s.late > 0 ? (
                            <span className="badge badge-sm badge-soft badge-warning">
                              {s.late}
                            </span>
                          ) : (
                            0
                          )}
                        </td>
                        <td>
                          <ItShare itDays={s.itDays} outsideDays={s.outsideDays} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
          <SectionCard
            title="Rata-rata Lama Tahapan"
            description="Hari, dari tahapan yang sudah selesai"
          >
            {d.stages.length === 0 ? (
              <p className="text-base-content/60 text-sm">Belum ada tahapan selesai.</p>
            ) : (
              <BarList
                ariaLabel="Rata-rata lama tiap tahapan dalam hari"
                rows={d.stages.map((s) => ({
                  key: s.type,
                  label: s.label,
                  hint: `${EXECUTOR_LABELS[s.executor]} · ${s.samples} data`,
                  value: s.avgDays,
                  display: `${fmtDays(s.avgDays)} hari`,
                }))}
              />
            )}
          </SectionCard>
        </div>
      )}
    </ReportShell>
  );
}
