import type {
  ApiSuccess,
  PrDto,
  PrHistoryEntryDto,
  PrInput,
  PrListItemDto,
  PrStockCheckInput,
} from '@sipita/shared';
import { api } from './client';
import { cleanParams, type ListParams, type ListResult } from './resource';

const base = '/purchase-requests';

export const purchaseRequestsApi = {
  async list(params: ListParams): Promise<ListResult<PrListItemDto>> {
    const res = await api.get<ApiSuccess<PrListItemDto[]>>(base, { params: cleanParams(params) });
    return { data: res.data.data, meta: res.data.meta! };
  },
  async get(id: string): Promise<PrDto> {
    return (await api.get<ApiSuccess<PrDto>>(`${base}/${id}`)).data.data;
  },
  async history(id: string): Promise<PrHistoryEntryDto[]> {
    return (await api.get<ApiSuccess<PrHistoryEntryDto[]>>(`${base}/${id}/history`)).data.data;
  },
  async create(input: PrInput): Promise<PrDto> {
    return (await api.post<ApiSuccess<PrDto>>(base, input)).data.data;
  },
  async update(id: string, input: PrInput): Promise<PrDto> {
    return (await api.put<ApiSuccess<PrDto>>(`${base}/${id}`, input)).data.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`${base}/${id}`);
  },
  async submit(id: string): Promise<PrDto> {
    return (await api.post<ApiSuccess<PrDto>>(`${base}/${id}/submit`)).data.data;
  },
  async startStockCheck(id: string): Promise<PrDto> {
    return (await api.post<ApiSuccess<PrDto>>(`${base}/${id}/start-stock-check`)).data.data;
  },
  async completeStockCheck(id: string, input: PrStockCheckInput): Promise<PrDto> {
    return (await api.post<ApiSuccess<PrDto>>(`${base}/${id}/stock-check`, input)).data.data;
  },
  async cancel(id: string, reason: string): Promise<PrDto> {
    return (await api.post<ApiSuccess<PrDto>>(`${base}/${id}/cancel`, { reason })).data.data;
  },
};
