import type {
  ApiSuccess,
  DashboardSummaryDto,
  LeadTimeDto,
  SpendingDto,
  SpendingGroup,
  VendorPerformanceDto,
} from '@sipita/shared';
import { api } from './client';

export const dashboardApi = {
  async summary(): Promise<DashboardSummaryDto> {
    return (await api.get<ApiSuccess<DashboardSummaryDto>>('/dashboard/summary')).data.data;
  },
  async spending(groupBy: SpendingGroup, year: number): Promise<SpendingDto> {
    return (
      await api.get<ApiSuccess<SpendingDto>>('/dashboard/spending', { params: { groupBy, year } })
    ).data.data;
  },
  async leadTime(year: number): Promise<LeadTimeDto> {
    return (await api.get<ApiSuccess<LeadTimeDto>>('/dashboard/lead-time', { params: { year } }))
      .data.data;
  },
  async vendorPerformance(year: number): Promise<VendorPerformanceDto[]> {
    return (
      await api.get<ApiSuccess<VendorPerformanceDto[]>>('/dashboard/vendor-performance', {
        params: { year },
      })
    ).data.data;
  },
};
