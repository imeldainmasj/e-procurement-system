import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboard.api';

// Dashboards summarise works and agreements, so their keys live under those resources and
// refresh whenever a work or document changes.
export function useStaffDashboard() {
  return useQuery({ queryKey: ['works', 'dashboard', 'staff'], queryFn: dashboardApi.staff });
}

export function useManagerDashboard(enabled: boolean) {
  return useQuery({
    queryKey: ['works', 'dashboard', 'manager'],
    queryFn: dashboardApi.manager,
    enabled,
  });
}

export function useTeam() {
  return useQuery({ queryKey: ['works', 'monitoring', 'team'], queryFn: dashboardApi.team });
}

export function useBoard(enabled: boolean) {
  return useQuery({
    queryKey: ['works', 'monitoring', 'board'],
    queryFn: dashboardApi.board,
    enabled,
  });
}

export function useStaffWorks(userId: string | null) {
  return useQuery({
    queryKey: ['works', 'monitoring', 'staff', userId],
    queryFn: () => dashboardApi.staffWorks(userId!),
    enabled: Boolean(userId),
  });
}
