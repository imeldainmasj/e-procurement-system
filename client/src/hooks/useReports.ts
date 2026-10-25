import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReportName } from '@sipita/shared';
import { reportsApi, type ReportParams } from '@/api/reports.api';

/** Reports read works and agreements, so they refresh with them. */
export function useReport<T>(name: ReportName, params: ReportParams) {
  return useQuery({
    queryKey: ['works', 'reports', name, params],
    queryFn: () => reportsApi.get<T>(name, params),
    placeholderData: keepPreviousData,
  });
}
