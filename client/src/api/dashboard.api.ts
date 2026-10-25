import type {
  ApiSuccess,
  BoardColumnDto,
  ManagerDashboardDto,
  StaffDashboardDto,
  StaffMonitoringDto,
  TeamMemberDto,
} from '@sipita/shared';
import { api } from './client';

const get = async <T>(url: string) => (await api.get<ApiSuccess<T>>(url)).data.data;

export const dashboardApi = {
  staff: () => get<StaffDashboardDto>('/dashboard/staff'),
  manager: () => get<ManagerDashboardDto>('/dashboard/manager'),
  team: () => get<TeamMemberDto[]>('/monitoring/team'),
  board: () => get<BoardColumnDto[]>('/monitoring/board'),
  staffWorks: (userId: string) => get<StaffMonitoringDto>(`/monitoring/staff/${userId}`),
};
