import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PoCreateInput,
  PoUpdateInput,
  QuotationCreateInput,
  QuotationInput,
  SettingsInput,
  VendorRatingInput,
} from '@sipita/shared';
import {
  priceHistoryApi,
  purchaseOrdersApi,
  quotationsApi,
  settingsApi,
} from '@/api/procurement.api';
import type { ListParams } from '@/api/resource';

const QUOTATIONS = 'quotations';
const POS = 'purchase-orders';

/** Quotation and PO changes also move the PR status and touch price history and vendors. */
function useInvalidateProcurement() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [QUOTATIONS, POS, 'purchase-requests', 'price-history', 'vendors'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

function useProcurementMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const invalidate = useInvalidateProcurement();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export function useQuotationComparison(prId: string | undefined) {
  return useQuery({
    queryKey: [QUOTATIONS, 'by-pr', prId],
    queryFn: () => quotationsApi.comparison(prId!),
    enabled: Boolean(prId),
  });
}

export function useQuotationMutations() {
  return {
    create: useProcurementMutation((input: QuotationCreateInput) => quotationsApi.create(input)),
    update: useProcurementMutation(({ id, input }: { id: string; input: QuotationInput }) =>
      quotationsApi.update(id, input),
    ),
    remove: useProcurementMutation((id: string) => quotationsApi.remove(id)),
    uploadFile: useProcurementMutation(({ id, file }: { id: string; file: File }) =>
      quotationsApi.uploadFile(id, file),
    ),
    removeFile: useProcurementMutation((id: string) => quotationsApi.removeFile(id)),
    select: useProcurementMutation(
      ({ id, justification }: { id: string; justification: string | null }) =>
        quotationsApi.select(id, { justification }),
    ),
    unselect: useProcurementMutation((id: string) => quotationsApi.unselect(id)),
  };
}

export function usePurchaseOrders(params: ListParams) {
  return useQuery({
    queryKey: [POS, params],
    queryFn: () => purchaseOrdersApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: [POS, id],
    queryFn: () => purchaseOrdersApi.get(id!),
    enabled: Boolean(id),
  });
}

export function usePoMutations() {
  return {
    create: useProcurementMutation((input: PoCreateInput) => purchaseOrdersApi.create(input)),
    update: useProcurementMutation(({ id, input }: { id: string; input: PoUpdateInput }) =>
      purchaseOrdersApi.update(id, input),
    ),
    issue: useProcurementMutation((id: string) => purchaseOrdersApi.issue(id)),
    cancel: useProcurementMutation(({ id, reason }: { id: string; reason: string }) =>
      purchaseOrdersApi.cancel(id, reason),
    ),
    rate: useProcurementMutation(({ id, input }: { id: string; input: VendorRatingInput }) =>
      purchaseOrdersApi.rate(id, input),
    ),
  };
}

export function usePriceHistory(params: ListParams) {
  return useQuery({
    queryKey: ['price-history', params],
    queryFn: () => priceHistoryApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function usePriceSummary(itemId: string | undefined) {
  return useQuery({
    queryKey: ['price-history', 'summary', itemId],
    queryFn: () => priceHistoryApi.summary(itemId!),
    enabled: Boolean(itemId),
  });
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: settingsApi.get, staleTime: 5 * 60_000 });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsInput) => settingsApi.update(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}
