import type { ReportParams } from '@/api/reports.api';

/** Query string for a drill-down to the work list with the report's filters. */
export function worksLink(params: ReportParams, extra: ReportParams = {}): string {
  const keys = [
    'yearFrom',
    'yearTo',
    'year',
    'method',
    'procurementType',
    'category',
    'vendorId',
    'picId',
    'status',
  ];
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...extra })) {
    if (keys.includes(k) && v !== undefined && v !== '') search.set(k, String(v));
  }
  return `/pekerjaan?${search.toString()}`;
}
