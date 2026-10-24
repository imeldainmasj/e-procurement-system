import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MilestoneTemplateInput,
  MilestoneUpdateInput,
  ProcurementMethod,
  ReassignInput,
  WorkCreateInput,
  WorkUpdateInput,
} from '@sipita/shared';
import type { ListParams } from '@/api/resource';
import { milestoneTemplatesApi, worksApi } from '@/api/works.api';

const KEY = 'works';

export function useWorks(params: ListParams, mine = false) {
  return useQuery({
    queryKey: [KEY, mine ? 'mine' : 'all', params],
    queryFn: () => worksApi.list(params, mine),
    placeholderData: keepPreviousData,
  });
}

export function useWork(id: string | undefined) {
  return useQuery({ queryKey: [KEY, id], queryFn: () => worksApi.get(id!), enabled: Boolean(id) });
}

export function useWorkUpdates(id: string, page: number) {
  return useQuery({
    queryKey: [KEY, id, 'updates', page],
    queryFn: () => worksApi.updates(id, page),
    placeholderData: keepPreviousData,
  });
}

export function useRuleEvaluation(amountIdr: number | null, previousPurchaseAmount: number | null) {
  return useQuery({
    queryKey: ['procurement-rules', amountIdr, previousPurchaseAmount],
    queryFn: () => worksApi.evaluate(amountIdr!, previousPurchaseAmount),
    enabled: amountIdr !== null && amountIdr > 0,
    placeholderData: keepPreviousData,
  });
}

export function useAgreementOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['agreements', 'options'],
    queryFn: () => worksApi.agreementOptions(),
    enabled,
  });
}

/** Every work mutation refreshes lists, the detail and its progress log. */
export function useWorkMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([KEY, 'vendors'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
  return {
    create: useMutation({
      mutationFn: (input: WorkCreateInput) => worksApi.create(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: WorkUpdateInput }) =>
        worksApi.update(id, input),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => worksApi.remove(id), onSuccess: invalidate }),
    reassign: useMutation({
      mutationFn: ({ id, input }: { id: string; input: ReassignInput }) =>
        worksApi.reassign(id, input),
      onSuccess: invalidate,
    }),
    updateMilestone: useMutation({
      mutationFn: (v: { id: string; milestoneId: string; input: MilestoneUpdateInput }) =>
        worksApi.updateMilestone(v.id, v.milestoneId, v.input),
      onSuccess: invalidate,
    }),
    addUpdate: useMutation({
      mutationFn: (v: {
        id: string;
        note: string;
        milestoneId: string | null;
        file: File | null;
      }) => worksApi.addUpdate(v.id, { note: v.note, milestoneId: v.milestoneId }, v.file),
      onSuccess: invalidate,
    }),
  };
}

export function useMilestoneTemplates() {
  return useQuery({ queryKey: ['milestone-templates'], queryFn: milestoneTemplatesApi.list });
}

export function useReplaceTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ method, input }: { method: ProcurementMethod; input: MilestoneTemplateInput }) =>
      milestoneTemplatesApi.replace(method, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['milestone-templates'] }),
  });
}
