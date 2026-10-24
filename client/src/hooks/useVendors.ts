import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VendorDocumentInput, VendorInput, VendorStatusInput } from '@sipita/shared';
import type { ListParams } from '@/api/resource';
import { vendorsApi } from '@/api/vendors.api';

const KEY = 'vendors';

export function useVendors(params: ListParams) {
  return useQuery({
    queryKey: [KEY, params],
    queryFn: () => vendorsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useVendor(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => vendorsApi.get(id!),
    enabled: Boolean(id),
  });
}

export function useVendorRatings(id: string | undefined, page: number) {
  return useQuery({
    queryKey: [KEY, id, 'ratings', page],
    queryFn: () => vendorsApi.ratings(id!, page),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

export function useVendorMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: [KEY] });
  return {
    create: useMutation({
      mutationFn: (input: VendorInput) => vendorsApi.create(input),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: VendorInput }) =>
        vendorsApi.update(id, input),
      onSuccess,
    }),
    changeStatus: useMutation({
      mutationFn: ({ id, input }: { id: string; input: VendorStatusInput }) =>
        vendorsApi.changeStatus(id, input),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (id: string) => vendorsApi.remove(id), onSuccess }),
    uploadDocument: useMutation({
      mutationFn: (vars: {
        id: string;
        input: VendorDocumentInput;
        file: File;
        onProgress?: (p: number) => void;
      }) => vendorsApi.uploadDocument(vars.id, vars.input, vars.file, vars.onProgress),
      onSuccess,
    }),
    removeDocument: useMutation({
      mutationFn: ({ id, documentId }: { id: string; documentId: string }) =>
        vendorsApi.removeDocument(id, documentId),
      onSuccess,
    }),
  };
}
