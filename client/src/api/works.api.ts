import type {
  AgreementOptionDto,
  ApiSuccess,
  MilestoneTemplateDto,
  MilestoneTemplateInput,
  MilestoneUpdateInput,
  ProcurementMethod,
  ReassignInput,
  RuleEvaluationDto,
  WorkCreateInput,
  WorkDetailDto,
  WorkListItemDto,
  WorkUpdateDto,
  WorkUpdateInput,
} from '@sipita/shared';
import { api } from './client';
import { cleanParams, type ListParams, type ListResult } from './resource';

const unwrap = <T>(res: { data: ApiSuccess<T> }) => res.data.data;
const listOf = <T>(res: { data: ApiSuccess<T[]> }): ListResult<T> => ({
  data: res.data.data,
  meta: res.data.meta!,
});

export const worksApi = {
  async list(params: ListParams, mine = false): Promise<ListResult<WorkListItemDto>> {
    return listOf(
      await api.get<ApiSuccess<WorkListItemDto[]>>(mine ? '/works/mine' : '/works', {
        params: cleanParams(params),
      }),
    );
  },
  async get(id: string): Promise<WorkDetailDto> {
    return unwrap(await api.get<ApiSuccess<WorkDetailDto>>(`/works/${id}`));
  },
  async create(input: WorkCreateInput): Promise<WorkDetailDto> {
    return unwrap(await api.post<ApiSuccess<WorkDetailDto>>('/works', input));
  },
  async update(id: string, input: WorkUpdateInput): Promise<WorkDetailDto> {
    return unwrap(await api.patch<ApiSuccess<WorkDetailDto>>(`/works/${id}`, input));
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/works/${id}`);
  },
  async reassign(id: string, input: ReassignInput): Promise<WorkDetailDto> {
    return unwrap(await api.post<ApiSuccess<WorkDetailDto>>(`/works/${id}/reassign`, input));
  },
  async updateMilestone(
    id: string,
    milestoneId: string,
    input: MilestoneUpdateInput,
  ): Promise<WorkDetailDto> {
    return unwrap(
      await api.patch<ApiSuccess<WorkDetailDto>>(`/works/${id}/milestones/${milestoneId}`, input),
    );
  },
  async updates(id: string, page = 1): Promise<ListResult<WorkUpdateDto>> {
    return listOf(
      await api.get<ApiSuccess<WorkUpdateDto[]>>(`/works/${id}/updates`, { params: { page } }),
    );
  },
  async addUpdate(
    id: string,
    input: { note: string; milestoneId: string | null },
    file: File | null,
  ): Promise<WorkUpdateDto> {
    const form = new FormData();
    form.append('note', input.note);
    if (input.milestoneId) form.append('milestoneId', input.milestoneId);
    if (file) form.append('file', file);
    return unwrap(await api.post<ApiSuccess<WorkUpdateDto>>(`/works/${id}/updates`, form));
  },
  async evaluate(
    amountIdr: number,
    previousPurchaseAmount: number | null,
  ): Promise<RuleEvaluationDto> {
    return unwrap(
      await api.get<ApiSuccess<RuleEvaluationDto>>('/procurement-rules/evaluate', {
        params: cleanParams({ amountIdr, previousPurchaseAmount }),
      }),
    );
  },
  async agreementOptions(search?: string): Promise<AgreementOptionDto[]> {
    return unwrap(
      await api.get<ApiSuccess<AgreementOptionDto[]>>('/agreements/options', {
        params: cleanParams({ search }),
      }),
    );
  },
};

export const milestoneTemplatesApi = {
  async list(): Promise<MilestoneTemplateDto[]> {
    return unwrap(await api.get<ApiSuccess<MilestoneTemplateDto[]>>('/milestone-templates'));
  },
  async replace(
    method: ProcurementMethod,
    input: MilestoneTemplateInput,
  ): Promise<MilestoneTemplateDto[]> {
    return unwrap(
      await api.put<ApiSuccess<MilestoneTemplateDto[]>>(`/milestone-templates/${method}`, input),
    );
  },
};
