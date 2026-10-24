import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SpendingGroup } from '@sipita/shared';
import { dashboardApi } from '@/api/dashboard.api';

const KEY = 'dashboard';
// Dashboard figures change slowly; refetch at most once a minute.
const staleTime = 60_000;

export function useDashboardSummary() {
  return useQuery({ queryKey: [KEY, 'summary'], queryFn: dashboardApi.summary, staleTime });
}

export function useSpending(groupBy: SpendingGroup, year: number, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'spending', groupBy, year],
    queryFn: () => dashboardApi.spending(groupBy, year),
    placeholderData: keepPreviousData,
    staleTime,
    enabled,
  });
}

export function useLeadTime(year: number, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'lead-time', year],
    queryFn: () => dashboardApi.leadTime(year),
    staleTime,
    enabled,
  });
}

export function useVendorPerformance(year: number, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'vendor-performance', year],
    queryFn: () => dashboardApi.vendorPerformance(year),
    staleTime,
    enabled,
  });
}
