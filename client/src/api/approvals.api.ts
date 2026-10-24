import type {
  ApiSuccess,
  ApprovalInboxItemDto,
  MemoDto,
  MemoListItemDto,
  NotificationDto,
} from '@sipita/shared';
import { api } from './client';
import { cleanParams, type ListParams, type ListResult } from './resource';

export const approvalsApi = {
  async list(params: ListParams): Promise<ListResult<ApprovalInboxItemDto>> {
    const res = await api.get<ApiSuccess<ApprovalInboxItemDto[]>>('/approvals', {
      params: cleanParams(params),
    });
    return { data: res.data.data, meta: res.data.meta! };
  },
  async pendingCount(): Promise<number> {
    return (await api.get<ApiSuccess<{ count: number }>>('/approvals/pending-count')).data.data
      .count;
  },
  async approve(stepId: string, comment?: string): Promise<ApprovalInboxItemDto> {
    return (
      await api.post<ApiSuccess<ApprovalInboxItemDto>>(`/approvals/${stepId}/approve`, { comment })
    ).data.data;
  },
  async reject(stepId: string, reason: string): Promise<ApprovalInboxItemDto> {
    return (
      await api.post<ApiSuccess<ApprovalInboxItemDto>>(`/approvals/${stepId}/reject`, { reason })
    ).data.data;
  },
};

export const memosApi = {
  async list(params: ListParams): Promise<ListResult<MemoListItemDto>> {
    const res = await api.get<ApiSuccess<MemoListItemDto[]>>('/memos', {
      params: cleanParams(params),
    });
    return { data: res.data.data, meta: res.data.meta! };
  },
  async get(id: string): Promise<MemoDto> {
    return (await api.get<ApiSuccess<MemoDto>>(`/memos/${id}`)).data.data;
  },
  /** The PDF needs the bearer token, so it is fetched as a blob instead of linked directly. */
  async pdf(id: string): Promise<Blob> {
    return (await api.get<Blob>(`/memos/${id}/pdf`, { responseType: 'blob' })).data;
  },
};

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
