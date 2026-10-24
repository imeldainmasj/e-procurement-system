import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListParams, ResourceApi } from '@/api/resource';

/**
 * TanStack Query hooks for a CRUD resource. Query keys follow `[key, params]` / `[key, id]`;
 * every mutation invalidates `key` plus any related keys (e.g. a list showing counts).
 */
export function createResourceHooks<TDto, TInput>(
  key: string,
  resource: ResourceApi<TDto, TInput>,
  relatedKeys: string[] = [],
) {
  function useInvalidate() {
    const queryClient = useQueryClient();
    return () =>
      Promise.all(
        [key, ...relatedKeys].map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
      );
  }

  return {
    useList(params: ListParams, options: { enabled?: boolean } = {}) {
      return useQuery({
        queryKey: [key, params],
        queryFn: () => resource.list(params),
        placeholderData: keepPreviousData,
        ...options,
      });
    },
    useDetail(id: string | undefined) {
      return useQuery({
        queryKey: [key, id],
        queryFn: () => resource.get(id!),
        enabled: Boolean(id),
      });
    },
    useCreate() {
      const invalidate = useInvalidate();
      return useMutation({
        mutationFn: (input: TInput) => resource.create(input),
        onSuccess: invalidate,
      });
    },
    useUpdate() {
      const invalidate = useInvalidate();
      return useMutation({
        mutationFn: ({ id, input }: { id: string; input: TInput }) => resource.update(id, input),
        onSuccess: invalidate,
      });
    },
    useRemove() {
      const invalidate = useInvalidate();
      return useMutation({
        mutationFn: (id: string) => resource.remove(id),
        onSuccess: invalidate,
      });
    },
  };
}
