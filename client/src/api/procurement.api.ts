import type {
  ApiSuccess,
  PoCreateInput,
  PoDto,
  PoListItemDto,
  PoUpdateInput,
  PriceHistoryDto,
  PriceSummaryDto,
  QuotationComparisonDto,
  QuotationCreateInput,
  QuotationDto,
  QuotationInput,
  SelectQuotationInput,
  SettingsDto,
  SettingsInput,
  VendorRatingInput,
} from '@sipita/shared';
import { api } from './client';
import { cleanParams, type ListParams, type ListResult } from './resource';

export const quotationsApi = {
  async comparison(prId: string): Promise<QuotationComparisonDto> {
    return (await api.get<ApiSuccess<QuotationComparisonDto>>(`/quotations/by-pr/${prId}`)).data
      .data;
  },
  async create(input: QuotationCreateInput): Promise<QuotationDto> {
    return (await api.post<ApiSuccess<QuotationDto>>('/quotations', input)).data.data;
  },
  async update(id: string, input: QuotationInput): Promise<QuotationDto> {
    return (await api.put<ApiSuccess<QuotationDto>>(`/quotations/${id}`, input)).data.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/quotations/${id}`);
  },
  async uploadFile(id: string, file: File): Promise<QuotationDto> {
    const form = new FormData();
    form.append('file', file);
    return (await api.post<ApiSuccess<QuotationDto>>(`/quotations/${id}/file`, form)).data.data;
  },
  async removeFile(id: string): Promise<QuotationDto> {
    return (await api.delete<ApiSuccess<QuotationDto>>(`/quotations/${id}/file`)).data.data;
  },
  async select(id: string, input: SelectQuotationInput): Promise<QuotationDto> {
    return (await api.post<ApiSuccess<QuotationDto>>(`/quotations/${id}/select`, input)).data.data;
  },
  async unselect(id: string): Promise<QuotationDto> {
    return (await api.post<ApiSuccess<QuotationDto>>(`/quotations/${id}/unselect`)).data.data;
  },
};

export const purchaseOrdersApi = {
  async list(params: ListParams): Promise<ListResult<PoListItemDto>> {
    const res = await api.get<ApiSuccess<PoListItemDto[]>>('/purchase-orders', {
      params: cleanParams(params),
    });
    return { data: res.data.data, meta: res.data.meta! };
  },
  async get(id: string): Promise<PoDto> {
    return (await api.get<ApiSuccess<PoDto>>(`/purchase-orders/${id}`)).data.data;
  },
  async create(input: PoCreateInput): Promise<PoDto> {
    return (await api.post<ApiSuccess<PoDto>>('/purchase-orders', input)).data.data;
  },
  async update(id: string, input: PoUpdateInput): Promise<PoDto> {
    return (await api.put<ApiSuccess<PoDto>>(`/purchase-orders/${id}`, input)).data.data;
  },
  async issue(id: string): Promise<PoDto> {
    return (await api.post<ApiSuccess<PoDto>>(`/purchase-orders/${id}/issue`)).data.data;
  },
  async cancel(id: string, reason: string): Promise<PoDto> {
    return (await api.post<ApiSuccess<PoDto>>(`/purchase-orders/${id}/cancel`, { reason })).data
      .data;
  },
  async rate(id: string, input: VendorRatingInput): Promise<PoDto> {
    return (await api.post<ApiSuccess<PoDto>>(`/purchase-orders/${id}/rating`, input)).data.data;
  },
  async pdf(id: string): Promise<Blob> {
    return (await api.get<Blob>(`/purchase-orders/${id}/pdf`, { responseType: 'blob' })).data;
  },
};

export const priceHistoryApi = {
  async list(params: ListParams): Promise<ListResult<PriceHistoryDto>> {
    const res = await api.get<ApiSuccess<PriceHistoryDto[]>>('/price-history', {
      params: cleanParams(params),
    });
    return { data: res.data.data, meta: res.data.meta! };
  },
  async summary(itemId: string): Promise<PriceSummaryDto> {
    return (await api.get<ApiSuccess<PriceSummaryDto>>(`/price-history/items/${itemId}/summary`))
      .data.data;
  },
};

export const settingsApi = {
  async get(): Promise<SettingsDto> {
    return (await api.get<ApiSuccess<SettingsDto>>('/settings')).data.data;
  },
  async update(input: SettingsInput): Promise<SettingsDto> {
    return (await api.put<ApiSuccess<SettingsDto>>('/settings', input)).data.data;
  },
};
