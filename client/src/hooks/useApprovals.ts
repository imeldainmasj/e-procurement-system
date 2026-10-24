import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { approvalsApi, memosApi, notificationsApi } from '@/api/approvals.api';
import type { ListParams } from '@/api/resource';
import { useAuthStore } from '@/stores/authStore';

const POLL_MS = 30_000;

export function useApprovalInbox(params: ListParams) {
  return useQuery({
    queryKey: ['approvals', params],
    queryFn: () => approvalsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

/** Pending approvals for the sidebar badge; only polled for approvers. */
export function usePendingApprovalCount() {
  const isApprover = useAuthStore((s) => s.user?.roles.includes('APPROVER') ?? false);
  return useQuery({
    queryKey: ['approvals', 'pending-count'],
    queryFn: approvalsApi.pendingCount,
    enabled: isApprover,
    refetchInterval: POLL_MS,
  });
}

/** Approve/reject refresh the inbox, PRs, memos and notifications. */
export function useApprovalDecision() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all(
      ['approvals', 'purchase-requests', 'memos', 'notifications'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  return {
    approve: useMutation({
      mutationFn: ({ stepId, comment }: { stepId: string; comment?: string }) =>
        approvalsApi.approve(stepId, comment),
      onSuccess: invalidate,
    }),
    reject: useMutation({
      mutationFn: ({ stepId, reason }: { stepId: string; reason: string }) =>
        approvalsApi.reject(stepId, reason),
      onSuccess: invalidate,
    }),
  };
}

export function useMemos(params: ListParams) {
  return useQuery({
    queryKey: ['memos', params],
    queryFn: () => memosApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useMemoDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['memos', id],
    queryFn: () => memosApi.get(id!),
    enabled: Boolean(id),
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: POLL_MS,
  });
}

export function useRecentNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => notificationsApi.list({ limit: 10 }),
    enabled,
  });
}

export function useNotificationActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  return {
    markRead: useMutation({ mutationFn: notificationsApi.markRead, onSuccess: invalidate }),
    markAllRead: useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate }),
  };
}
