import type { ApiSuccess } from '@sipita/shared';
import { api } from './client';

export interface HealthStatus {
  status: 'ok';
  database: 'up';
}

export async function getReadiness(): Promise<HealthStatus> {
  const res = await api.get<ApiSuccess<HealthStatus>>('/health/ready');
  return res.data.data;
}
