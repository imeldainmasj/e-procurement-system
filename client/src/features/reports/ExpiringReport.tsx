import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import {
  formatRupiah,
  WORK_STATUS_LABELS,
  type ExpiringAgreementDto,
  type ExpiringAgreementsDto,
  type WorkStatus,
} from '@sipita/shared';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionCard } from '@/components/ui/SectionCard';
import { useListParams } from '@/hooks/useListParams';
import { useReport } from '@/hooks/useReports';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/formatDate';
import { LoadingOrError, ReportShell } from './ReportShell';

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const urgency = (daysLeft: number) =>
  daysLeft <= 30 ? 'error' : daysLeft <= 60 ? 'warning' : 'info';

/** One month grid; days on which a contract ends are marked with their count. */
function MonthCalendar({
  month,
  agreements,
}: {
  month: dayjs.Dayjs;
  agreements: ExpiringAgreementDto[];
}) {
  const first = month.startOf('month');
  const offset = (first.day() + 6) % 7; // Monday first
  const days = month.daysInMonth();
  const byDay = new Map<number, ExpiringAgreementDto[]>();
  for (const a of agreements) {
    const d = dayjs(a.effectivePeriodEnd).date();
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold capitalize">
        {month.locale('id').format('MMMM YYYY')}
      </h3>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-base-content/60">
            {w}
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const list = byDay.get(i + 1);
          const tone = list ? urgency(Math.min(...list.map((a) => a.daysLeft))) : null;
          return (
            <div
              key={i}
              className={cn(
                'rounded py-1 tabular-nums',
                tone === 'error' && 'bg-error/15 text-error font-semibold',
                tone === 'warning' && 'bg-warning/20 font-semibold',
                tone === 'info' && 'bg-info/15 font-semibold',
              )}
              title={list?.map((a) => `${a.agreementNo} — ${a.title}`).join('\n')}
            >
              {i + 1}
              {list && list.length > 1 && <sup>{list.length}</sup>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Kalender & daftar agreement yang habis dalam 30/60/90 hari, untuk perencanaan renewal. */
export function ExpiringReport() {
  const [params, setParams] = useListParams({ days: 90 });
  const { page: _p, limit: _l, ...filters } = params;
  const report = useReport<ExpiringAgreementsDto>('expiring-agreements', filters);
  const d = report.data;
  const months = d
    ? Array.from(
        { length: dayjs().add(d.days, 'day').diff(dayjs().startOf('month'), 'month') + 1 },
        (_, i) => dayjs().startOf('month').add(i, 'month'),
      )
    : [];

  return (
    <ReportShell
      name="expiring-agreements"
      title="Jatuh Tempo"
      description="Agreement yang berakhir dalam waktu dekat (termasuk perpanjangan addendum), untuk merencanakan renewal."
      params={filters}
      onParamsChange={setParams}
      fields={['vendor', 'pic']}
      extraFilters={
        <div className="join">
          {[30, 60, 90].map((days) => (
            <button
              key={days}
              type="button"
              className={cn(
                'join-item btn btn-sm',
                params.days === days ? 'btn-secondary' : 'btn-soft btn-secondary',
              )}
              onClick={() => setParams({ days })}
            >
              ≤ {days} hari
            </button>
          ))}
        </div>
      }
    >
      {!d ? (
        <LoadingOrError isPending={report.isPending} error={report.error} />
      ) : (
        <>
          <SectionCard
            title="Kalender"
            description="Merah ≤ 30 hari, kuning ≤ 60 hari, biru > 60 hari. Arahkan kursor ke tanggal untuk melihat kontraknya."
          >
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {months.map((m) => (
                <MonthCalendar
                  key={m.format('YYYY-MM')}
                  month={m}
                  agreements={d.agreements.filter((a) =>
                    a.effectivePeriodEnd.startsWith(m.format('YYYY-MM')),
                  )}
                />
              ))}
            </div>
          </SectionCard>
          <SectionCard title={`Daftar (${d.agreements.length})`} flush>
            {d.agreements.length === 0 ? (
              <EmptyState title={`Tidak ada agreement yang berakhir dalam ${d.days} hari`} />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-sm table">
                  <thead className="bg-base-200/60 text-base-content/60 text-xs uppercase">
                    <tr>
                      <th>Berakhir</th>
                      <th>Agreement</th>
                      <th>Vendor</th>
                      <th>PIC</th>
                      <th className="text-right">Nilai</th>
                      <th>Perpanjangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.agreements.map((a) => (
                      <tr key={a.id} className="hover:bg-base-200/40">
                        <td className="whitespace-nowrap">
                          <div>{formatDate(a.effectivePeriodEnd)}</div>
                          <span
                            className={cn(
                              'badge badge-xs badge-soft',
                              `badge-${urgency(a.daysLeft)}`,
                            )}
                          >
                            {a.daysLeft} hari lagi
                          </span>
                        </td>
                        <td>
                          <Link to={`/kontrak/${a.id}`} className="link link-hover font-medium">
                            {a.title}
                          </Link>
                          <div className="text-base-content/60 font-mono text-xs">
                            {a.agreementNo}
                          </div>
                        </td>
                        <td>{a.vendor.name}</td>
                        <td>{a.pic.name}</td>
                        <td className="text-right whitespace-nowrap tabular-nums">
                          {formatRupiah(a.amountIdr)}
                        </td>
                        <td>
                          {a.renewal ? (
                            <Link
                              to={`/pekerjaan/${a.renewal.id}`}
                              className="link link-primary text-sm"
                            >
                              {a.renewal.code} ·{' '}
                              {WORK_STATUS_LABELS[a.renewal.status as WorkStatus]}
                            </Link>
                          ) : (
                            <span className="badge badge-sm badge-soft badge-warning">
                              Belum ada
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </ReportShell>
  );
}
