import { Link, useNavigate } from 'react-router-dom';
import {
  ANNUAL_GROUP_LABELS,
  ANNUAL_GROUPS,
  formatRupiah,
  type AnnualGroupBy,
  type AnnualSummaryDto,
} from '@sipita/shared';
import { YearValueChart } from '@/components/charts/YearValueChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
import { useListParams } from '@/hooks/useListParams';
import { useReport } from '@/hooks/useReports';
import { LoadingOrError, ReportShell } from './ReportShell';
import { worksLink } from './worksLink';

/** Work-list filter that corresponds to a group key. */
const DRILL_KEY: Record<AnnualGroupBy, string> = {
  method: 'method',
  procurementType: 'procurementType',
  category: 'category',
  vendor: 'vendorId',
  directorate: 'requesterDirectorateId',
};

/** Rekap nilai pengadaan per tahun (2015–sekarang), optionally split by one dimension. */
export function AnnualSummaryReport() {
  const navigate = useNavigate();
  const [params, setParams] = useListParams({ yearFrom: 2015 });
  const { page: _p, limit: _l, ...filters } = params;
  const report = useReport<AnnualSummaryDto>('annual-summary', filters);
  const groupBy = params.groupBy as AnnualGroupBy | undefined;
  const d = report.data;

  return (
    <ReportShell
      name="annual-summary"
      title="Rekap Tahunan"
      description="Total nilai pengadaan per tahun pengadaan (pekerjaan dibatalkan tidak dihitung)."
      params={filters}
      onParamsChange={setParams}
      fields={['yearRange', 'method', 'procurementType', 'category', 'vendor']}
      extraFilters={
        <select
          className="select select-sm w-auto"
          aria-label="Pecah per"
          value={groupBy ?? ''}
          onChange={(e) => setParams({ groupBy: e.target.value || undefined })}
        >
          <option value="">Tanpa rincian</option>
          {ANNUAL_GROUPS.map((g) => (
            <option key={g} value={g}>
              Pecah per {ANNUAL_GROUP_LABELS[g].toLowerCase()}
            </option>
          ))}
        </select>
      }
    >
      {!d ? (
        <LoadingOrError isPending={report.isPending} error={report.error} />
      ) : d.years.length === 0 ? (
        <EmptyState title="Tidak ada data untuk filter ini" />
      ) : (
        <>
          <div className="card">
            <div className="divide-base-300 bg-base-200/60 grid grid-cols-2 divide-x divide-dashed text-center">
              <div className="p-4">
                <div className="text-2xl font-semibold">{formatRupiah(d.total.amountIdr)}</div>
                <div className="stat-label">Total nilai</div>
              </div>
              <div className="p-4">
                <div className="text-2xl font-semibold">
                  {d.total.count.toLocaleString('id-ID')}
                </div>
                <div className="stat-label">Pekerjaan</div>
              </div>
            </div>
          </div>
          <SectionCard title="Nilai per Tahun" description="Klik batang untuk melihat pekerjaannya">
            <YearValueChart
              data={d.years}
              onSelectYear={(year) =>
                navigate(worksLink(filters, { year, yearFrom: undefined, yearTo: undefined }))
              }
            />
          </SectionCard>
          {groupBy && (
            <SectionCard
              title={`Rincian per ${ANNUAL_GROUP_LABELS[groupBy].toLowerCase()}`}
              description="Klik angka untuk melihat pekerjaannya"
              flush
            >
              <div className="overflow-x-auto">
                <table className="table-sm table">
                  <thead className="bg-base-200/60 text-base-content/60 text-xs uppercase">
                    <tr>
                      <th>Tahun</th>
                      {d.groups.map((g) => (
                        <th key={g.key} className="text-right whitespace-nowrap">
                          {g.label}
                        </th>
                      ))}
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.years.map((y) => (
                      <tr key={y.year} className="hover:bg-base-200/40">
                        <td className="font-medium">{y.year}</td>
                        {d.groups.map((g) => {
                          const cell = d.cells.find((c) => c.year === y.year && c.key === g.key);
                          return (
                            <td key={g.key} className="text-right whitespace-nowrap tabular-nums">
                              {cell ? (
                                <Link
                                  className="link link-hover"
                                  to={worksLink(filters, {
                                    year: y.year,
                                    yearFrom: undefined,
                                    yearTo: undefined,
                                    ...(g.key !== 'NONE' && { [DRILL_KEY[groupBy]]: g.key }),
                                  })}
                                  title={`${cell.count} pekerjaan`}
                                >
                                  {formatRupiah(cell.amountIdr)}
                                </Link>
                              ) : (
                                <span className="text-base-content/40">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="text-right font-medium whitespace-nowrap tabular-nums">
                          {formatRupiah(y.amountIdr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td>Total</td>
                      {d.groups.map((g) => (
                        <td key={g.key} className="text-right whitespace-nowrap tabular-nums">
                          {formatRupiah(g.amountIdr)}
                        </td>
                      ))}
                      <td className="text-right whitespace-nowrap tabular-nums">
                        {formatRupiah(d.total.amountIdr)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}
    </ReportShell>
  );
}
