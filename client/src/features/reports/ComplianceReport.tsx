import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PROCUREMENT_METHOD_LABELS, type ComplianceDto } from '@sipita/shared';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
import { useListParams } from '@/hooks/useListParams';
import { useReport } from '@/hooks/useReports';
import { cn } from '@/utils/cn';
import { LoadingOrError, ReportShell } from './ReportShell';

/** Pekerjaan yang datanya tidak sesuai aturan pengadaan (§5.5), dikelompokkan per jenis catatan. */
export function ComplianceReport() {
  const [params, setParams] = useListParams({ yearFrom: 2015 });
  const report = useReport<ComplianceDto>('compliance', params);
  const d = report.data;
  const pages = d ? Math.max(1, Math.ceil(d.meta.total / d.meta.limit)) : 1;

  return (
    <ReportShell
      name="compliance"
      title="Kepatuhan"
      description="Pekerjaan dengan data yang tidak sesuai aturan pengadaan atau belum lengkap. Ini catatan, bukan blokir."
      params={params}
      onParamsChange={setParams}
      fields={['yearRange', 'method', 'procurementType', 'category', 'pic']}
    >
      {!d ? (
        <LoadingOrError isPending={report.isPending} error={report.error} />
      ) : (
        <>
          <SectionCard
            title="Jenis Catatan"
            description={`${d.totalWorks.toLocaleString('id-ID')} pekerjaan punya catatan. Klik untuk menyaring daftar.`}
          >
            {d.byCode.length === 0 ? (
              <p className="text-base-content/60 text-sm">Semua pekerjaan sesuai aturan.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn(
                    'btn btn-sm',
                    !params.code ? 'btn-secondary' : 'btn-soft btn-secondary',
                  )}
                  onClick={() => setParams({ code: undefined })}
                >
                  Semua
                </button>
                {d.byCode.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    className={cn(
                      'btn btn-sm',
                      params.code === c.code ? 'btn-secondary' : 'btn-soft btn-secondary',
                    )}
                    onClick={() => setParams({ code: c.code })}
                  >
                    {c.label}
                    <span className="badge badge-sm">{c.count}</span>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
          <SectionCard title={`Pekerjaan (${d.meta.total.toLocaleString('id-ID')})`} flush>
            {d.works.length === 0 ? (
              <EmptyState title="Tidak ada pekerjaan dengan catatan" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="table-sm table">
                    <thead className="bg-base-200/60 text-base-content/60 text-xs uppercase">
                      <tr>
                        <th>Pekerjaan</th>
                        <th>Tahun</th>
                        <th>Metode</th>
                        <th>PIC</th>
                        <th>Catatan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.works.map((w) => (
                        <tr key={w.id} className="hover:bg-base-200/40 align-top">
                          <td>
                            <Link to={`/pekerjaan/${w.id}`} className="link link-hover font-medium">
                              {w.title}
                            </Link>
                            <div className="text-base-content/60 font-mono text-xs">{w.code}</div>
                          </td>
                          <td className="tabular-nums">{w.procurementYear}</td>
                          <td className="whitespace-nowrap">
                            {PROCUREMENT_METHOD_LABELS[w.method]}
                          </td>
                          <td className="whitespace-nowrap">{w.pic.name}</td>
                          <td>
                            <ul className="list-disc ps-4 text-sm">
                              {w.issues.map((i) => (
                                <li key={i.code + i.message}>{i.message}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pages > 1 && (
                  <div className="border-base-300 flex items-center justify-end gap-2 border-t px-4 py-3 text-sm">
                    <span className="text-base-content/60">
                      Halaman {d.meta.page} dari {pages}
                    </span>
                    <div className="join">
                      <button
                        type="button"
                        className="join-item btn btn-sm"
                        aria-label="Sebelumnya"
                        disabled={d.meta.page <= 1}
                        onClick={() => setParams({ page: d.meta.page - 1 })}
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="join-item btn btn-sm"
                        aria-label="Berikutnya"
                        disabled={d.meta.page >= pages}
                        onClick={() => setParams({ page: d.meta.page + 1 })}
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </SectionCard>
        </>
      )}
    </ReportShell>
  );
}
