import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agreementsApi, documentsApi } from '@/api/documents.api';
import type { ListParams } from '@/api/resource';

export function useWorkDocuments(workId: string) {
  return useQuery({
    queryKey: ['works', workId, 'documents'],
    queryFn: () => documentsApi.get(workId),
  });
}

/**
 * Documents change milestones, data issues and the progress log of the work, and appear on
 * agreement pages, so every document mutation refreshes works and agreements.
 */
export function useDocumentMutation<V>(mutationFn: (variables: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        ['works', 'agreements', 'vendors'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}

export function useAgreements(params: ListParams) {
  return useQuery({
    queryKey: ['agreements', params],
    queryFn: () => agreementsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useAgreement(id: string | undefined) {
  return useQuery({
    queryKey: ['agreements', id],
    queryFn: () => agreementsApi.get(id!),
    enabled: Boolean(id),
  });
}
