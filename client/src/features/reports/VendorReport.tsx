import { Link } from 'react-router-dom';
import { formatRupiah, type VendorHistoryRowDto } from '@sipita/shared';
import { BarList } from '@/components/charts/BarList';
import { formatRupiahShort } from '@/components/charts/chartColors';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
import { useListParams } from '@/hooks/useListParams';
import { useReport } from '@/hooks/useReports';
import { LoadingOrError, ReportShell } from './ReportShell';
import { worksLink } from './worksLink';

/** Riwayat & total pengadaan per vendor. */
export function VendorReport() {
  const [params, setParams] = useListParams({ yearFrom: 2015 });
  const { page: _p, limit: _l, ...filters } = params;
  const report = useReport<VendorHistoryRowDto[]>('vendor-history', filters);
  const rows = report.data;

  return (
    <ReportShell
      name="vendor-history"
      title="Riwayat Vendor"
      description="Jumlah pekerjaan, total nilai, dan kontrak per vendor."
      params={filters}
      onParamsChange={setParams}
      fields={['yearRange', 'method', 'procurementType', 'category']}
    >
      {!rows ? (
        <LoadingOrError isPending={report.isPending} error={report.error} />
      ) : rows.length === 0 ? (
        <EmptyState title="Tidak ada data untuk filter ini" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <SectionCard title="10 Vendor Terbesar" description="Total nilai pengadaan (IDR)">
            <BarList
              ariaLabel="Total nilai pengadaan per vendor"
              rows={rows.slice(0, 10).map((r) => ({
                key: r.vendor.id,
                label: r.vendor.name,
                value: r.totalIdr,
                display: formatRupiahShort(r.totalIdr),
              }))}
            />
          </SectionCard>
          <SectionCard title="Semua Vendor" className="xl:col-span-2" flush>
            <div className="overflow-x-auto">
              <table className="table-sm table">
                <thead className="bg-base-200/60 text-base-content/60 text-xs uppercase">
                  <tr>
                    <th>Vendor</th>
                    <th className="text-right">Pekerjaan</th>
                    <th className="text-right">Total Nilai</th>
                    <th className="text-right">Kontrak</th>
                    <th>Periode</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.vendor.id} className="hover:bg-base-200/40">
                      <td>
                        <Link to={`/vendor/${r.vendor.id}`} className="link link-hover font-medium">
                          {r.vendor.name}
                        </Link>
                        <div className="text-base-content/60 font-mono text-xs">
                          {r.vendor.code}
                        </div>
                      </td>
                      <td className="text-right tabular-nums">
                        <Link
                          className="link link-hover"
                          to={worksLink(filters, { vendorId: r.vendor.id })}
                        >
                          {r.workCount}
                        </Link>
                      </td>
                      <td className="text-right whitespace-nowrap tabular-nums">
                        {formatRupiah(r.totalIdr)}
                      </td>
                      <td className="text-right tabular-nums">
                        {r.agreementCount}
                        {r.activeAgreements > 0 && (
                          <span className="text-base-content/60 text-xs">
                            {' '}
                            ({r.activeAgreements} aktif)
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        {r.firstYear === r.lastYear ? r.firstYear : `${r.firstYear}–${r.lastYear}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}
    </ReportShell>
  );
}
