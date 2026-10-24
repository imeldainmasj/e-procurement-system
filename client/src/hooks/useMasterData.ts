import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ResetPasswordInput } from '@sipita/shared';
import { departmentsApi, directoratesApi, divisionsApi, usersApi } from '@/api/master.api';
import { createResourceHooks } from './useResource';

// Related keys: lists that display data from another resource (names, counts).
export const directorateHooks = createResourceHooks('directorates', directoratesApi, ['divisions']);
export const divisionHooks = createResourceHooks('divisions', divisionsApi, [
  'directorates',
  'departments',
]);
export const departmentHooks = createResourceHooks('departments', departmentsApi, [
  'divisions',
  'users',
]);
export const userHooks = createResourceHooks('users', usersApi, ['departments']);

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResetPasswordInput }) =>
      usersApi.resetPassword(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

/** Active users for PIC pickers and filters. */
export function useUserOptions() {
  return useQuery({ queryKey: ['users', 'options'], queryFn: usersApi.options });
}

/** Options for <select>s; loads up to 100 records (the API maximum). */
const ALL = { page: 1, limit: 100, sort: 'code:asc' } as const;

export function useDirectorateOptions() {
  return directorateHooks.useList(ALL);
}

export function useDivisionOptions() {
  return divisionHooks.useList(ALL);
}

export function useDepartmentOptions() {
  return departmentHooks.useList(ALL);
}
