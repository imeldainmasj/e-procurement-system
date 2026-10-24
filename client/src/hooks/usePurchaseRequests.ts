import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PrInput, PrStockCheckInput } from '@sipita/shared';
import { purchaseRequestsApi } from '@/api/purchaseRequests.api';
import type { ListParams } from '@/api/resource';

const KEY = 'purchase-requests';

export function usePurchaseRequests(params: ListParams) {
  return useQuery({
    queryKey: [KEY, params],
    queryFn: () => purchaseRequestsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function usePrRequesters(search: string, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, 'requesters', search],
    queryFn: () => purchaseRequestsApi.requesters(search || undefined),
    enabled,
  });
}

export function usePurchaseRequest(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => purchaseRequestsApi.get(id!),
    enabled: Boolean(id),
  });
}

export function usePurchaseRequestHistory(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id, 'history'],
    queryFn: () => purchaseRequestsApi.history(id!),
    enabled: Boolean(id),
  });
}

/** Every PR mutation refreshes lists, the detail and its history. */
function usePrMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function usePrMutations() {
  return {
    create: usePrMutation((input: PrInput) => purchaseRequestsApi.create(input)),
    update: usePrMutation(({ id, input }: { id: string; input: PrInput }) =>
      purchaseRequestsApi.update(id, input),
    ),
    remove: usePrMutation((id: string) => purchaseRequestsApi.remove(id)),
    submit: usePrMutation((id: string) => purchaseRequestsApi.submit(id)),
    startStockCheck: usePrMutation((id: string) => purchaseRequestsApi.startStockCheck(id)),
    completeStockCheck: usePrMutation(({ id, input }: { id: string; input: PrStockCheckInput }) =>
      purchaseRequestsApi.completeStockCheck(id, input),
    ),
    cancel: usePrMutation(({ id, reason }: { id: string; reason: string }) =>
      purchaseRequestsApi.cancel(id, reason),
    ),
  };
}
