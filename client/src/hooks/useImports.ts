import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { importsApi } from '@/api/imports.api';
import type { ListParams } from '@/api/resource';

const KEY = 'imports';
/** Batch state is polled while a background step (validate/commit/rollback) runs. */
const POLL_MS = 1500;

export function useImportBatches(params: ListParams) {
  return useQuery({
    queryKey: [KEY, params],
    queryFn: () => importsApi.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.data.some((b) => b.phase) ? POLL_MS : false),
  });
}

export function useImportBatch(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => importsApi.get(id!),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data?.phase ? POLL_MS : false),
  });
}

export function useImportIssues(
  id: string,
  params: { page: number; limit: number; level?: string; sheet?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: [KEY, id, 'issues', params],
    queryFn: () => importsApi.issues(id, params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Import changes works, documents, vendors and agreements everywhere. */
export function useImportMutation<V, R>(mutationFn: (v: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        [KEY, 'works', 'agreements', 'vendors'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}
