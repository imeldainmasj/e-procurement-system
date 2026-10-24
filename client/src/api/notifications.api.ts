import type { ApiSuccess, NotificationDto } from '@sipita/shared';
import { api } from './client';
import { cleanParams, type ListResult } from './resource';

export const notificationsApi = {
  async list(
    params: { page?: number; limit?: number; unreadOnly?: boolean } = {},
  ): Promise<ListResult<NotificationDto>> {
    const res = await api.get<ApiSuccess<NotificationDto[]>>('/notifications', {
      params: cleanParams(params),
    });
    return { data: res.data.data, meta: res.data.meta! };
  },
  async unreadCount(): Promise<number> {
    return (await api.get<ApiSuccess<{ count: number }>>('/notifications/unread-count')).data.data
      .count;
  },
  async markRead(id: string): Promise<void> {
    await api.post(`/notifications/${id}/read`);
  },
  async markAllRead(): Promise<void> {
    await api.post('/notifications/read-all');
  },
};
