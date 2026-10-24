import type {
  AddendumInput,
  AgreementDto,
  AgreementInput,
  ApiSuccess,
  MemoInput,
  PaymentTermInput,
  PoInput,
  PvpApprovalInput,
  PvpInput,
  RfqInput,
  WorkDocumentsDto,
} from '@sipita/shared';
import { api } from './client';
import { cleanParams, type ListParams, type ListResult } from './resource';

const data = <T>(res: { data: ApiSuccess<T> }) => res.data.data;

/** Documents of one work (CLAUDE.md §8): /works/:id/memos, /rfq, /pvp, /purchase-orders. */
export const documentsApi = {
  async get(workId: string): Promise<WorkDocumentsDto> {
    return data(await api.get<ApiSuccess<WorkDocumentsDto>>(`/works/${workId}/documents`));
  },
  saveMemo: async (workId: string, input: MemoInput, id?: string) =>
    data(
      id
        ? await api.put<ApiSuccess<unknown>>(`/works/${workId}/memos/${id}`, input)
        : await api.post<ApiSuccess<unknown>>(`/works/${workId}/memos`, input),
    ),
  deleteMemo: (workId: string, id: string) => api.delete(`/works/${workId}/memos/${id}`),
  saveRfq: async (workId: string, input: RfqInput) =>
    data(await api.put<ApiSuccess<unknown>>(`/works/${workId}/rfq`, input)),
  deleteRfq: (workId: string) => api.delete(`/works/${workId}/rfq`),
  savePvp: async (workId: string, input: PvpInput) =>
    data(await api.put<ApiSuccess<unknown>>(`/works/${workId}/pvp`, input)),
  deletePvp: (workId: string) => api.delete(`/works/${workId}/pvp`),
  saveApproval: async (workId: string, input: PvpApprovalInput, id?: string) =>
    data(
      id
        ? await api.put<ApiSuccess<unknown>>(`/works/${workId}/pvp/approvals/${id}`, input)
        : await api.post<ApiSuccess<unknown>>(`/works/${workId}/pvp/approvals`, input),
    ),
  deleteApproval: (workId: string, id: string) =>
    api.delete(`/works/${workId}/pvp/approvals/${id}`),
  savePo: async (workId: string, input: PoInput, id?: string) =>
    data(
      id
        ? await api.put<ApiSuccess<unknown>>(`/works/${workId}/purchase-orders/${id}`, input)
        : await api.post<ApiSuccess<unknown>>(`/works/${workId}/purchase-orders`, input),
    ),
  deletePo: (workId: string, id: string) => api.delete(`/works/${workId}/purchase-orders/${id}`),
  saveTerm: async (workId: string, poId: string, input: PaymentTermInput, id?: string) => {
    const base = `/works/${workId}/purchase-orders/${poId}/payment-terms`;
    return data(
      id
        ? await api.put<ApiSuccess<unknown>>(`${base}/${id}`, input)
        : await api.post<ApiSuccess<unknown>>(base, input),
    );
  },
  deleteTerm: (workId: string, poId: string, id: string) =>
    api.delete(`/works/${workId}/purchase-orders/${poId}/payment-terms/${id}`),
};

export const agreementsApi = {
  async list(params: ListParams): Promise<ListResult<AgreementDto>> {
    const res = await api.get<ApiSuccess<AgreementDto[]>>('/agreements', {
      params: cleanParams(params),
    });
    return { data: res.data.data, meta: res.data.meta! };
  },
  async get(id: string): Promise<AgreementDto> {
    return data(await api.get<ApiSuccess<AgreementDto>>(`/agreements/${id}`));
  },
  async save(input: AgreementInput, id?: string): Promise<AgreementDto> {
    return data(
      id
        ? await api.put<ApiSuccess<AgreementDto>>(`/agreements/${id}`, input)
        : await api.post<ApiSuccess<AgreementDto>>('/agreements', input),
    );
  },
  remove: (id: string) => api.delete(`/agreements/${id}`),
  async terminate(id: string): Promise<AgreementDto> {
    return data(await api.post<ApiSuccess<AgreementDto>>(`/agreements/${id}/terminate`));
  },
  async saveAddendum(
    agreementId: string,
    input: AddendumInput,
    id?: string,
  ): Promise<AgreementDto> {
    const base = `/agreements/${agreementId}/addendums`;
    return data(
      id
        ? await api.put<ApiSuccess<AgreementDto>>(`${base}/${id}`, input)
        : await api.post<ApiSuccess<AgreementDto>>(base, input),
    );
  },
  async deleteAddendum(agreementId: string, id: string): Promise<AgreementDto> {
    return data(
      await api.delete<ApiSuccess<AgreementDto>>(`/agreements/${agreementId}/addendums/${id}`),
    );
  },
};
