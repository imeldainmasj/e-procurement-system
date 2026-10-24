import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ResetPasswordInput } from '@sipita/shared';
import {
  approvalRulesApi,
  divisionsApi,
  itemCategoriesApi,
  itemsApi,
  usersApi,
  warehousesApi,
} from '@/api/master.api';
import { createResourceHooks } from './useResource';

// Related keys: lists that display data from another resource (names, counts).
export const divisionHooks = createResourceHooks('divisions', divisionsApi, ['users']);
export const userHooks = createResourceHooks('users', usersApi, ['divisions']);
export const itemCategoryHooks = createResourceHooks('item-categories', itemCategoriesApi, [
  'items',
]);
export const itemHooks = createResourceHooks('items', itemsApi, ['item-categories']);
export const warehouseHooks = createResourceHooks('warehouses', warehousesApi);
export const approvalRuleHooks = createResourceHooks('approval-rules', approvalRulesApi);

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResetPasswordInput }) =>
      usersApi.resetPassword(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useApprovalRules() {
  return useQuery({ queryKey: ['approval-rules', 'all'], queryFn: approvalRulesApi.listAll });
}

/** Options for <select>s; loads up to 100 records (the API maximum). */
export function useDivisionOptions() {
  return divisionHooks.useList({ page: 1, limit: 100, sort: 'name:asc' });
}

export function useCategoryOptions() {
  return itemCategoryHooks.useList({ page: 1, limit: 100, sort: 'name:asc' });
}
