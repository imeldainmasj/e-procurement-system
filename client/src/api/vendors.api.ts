import type {
  ApiSuccess,
  VendorDocumentDto,
  VendorDocumentInput,
  VendorDto,
  VendorInput,
  VendorListItemDto,
  VendorRatingDto,
  VendorStatusInput,
} from '@sipita/shared';
import { api } from './client';
import { cleanParams, type ListParams, type ListResult } from './resource';

export const vendorsApi = {
  async list(params: ListParams): Promise<ListResult<VendorListItemDto>> {
    const res = await api.get<ApiSuccess<VendorListItemDto[]>>('/vendors', {
      params: cleanParams(params),
    });
    return { data: res.data.data, meta: res.data.meta! };
  },
  async get(id: string): Promise<VendorDto> {
    return (await api.get<ApiSuccess<VendorDto>>(`/vendors/${id}`)).data.data;
  },
  async create(input: VendorInput): Promise<VendorDto> {
    return (await api.post<ApiSuccess<VendorDto>>('/vendors', input)).data.data;
  },
  async update(id: string, input: VendorInput): Promise<VendorDto> {
    return (await api.put<ApiSuccess<VendorDto>>(`/vendors/${id}`, input)).data.data;
  },
  async changeStatus(id: string, input: VendorStatusInput): Promise<VendorDto> {
    return (await api.post<ApiSuccess<VendorDto>>(`/vendors/${id}/status`, input)).data.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/vendors/${id}`);
  },
  async ratings(id: string, page = 1): Promise<ListResult<VendorRatingDto>> {
    const res = await api.get<ApiSuccess<VendorRatingDto[]>>(`/vendors/${id}/ratings`, {
      params: { page },
    });
    return { data: res.data.data, meta: res.data.meta! };
  },
  async uploadDocument(
    id: string,
    input: VendorDocumentInput,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<VendorDocumentDto> {
    const form = new FormData();
    for (const [key, value] of Object.entries(input)) {
      if (value !== null && value !== undefined) form.append(key, String(value));
    }
    form.append('file', file);
    const res = await api.post<ApiSuccess<VendorDocumentDto>>(`/vendors/${id}/documents`, form, {
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
    });
    return res.data.data;
  },
  async removeDocument(id: string, documentId: string): Promise<void> {
    await api.delete(`/vendors/${id}/documents/${documentId}`);
  },
};

export const attachmentsApi = {
  async download(id: string): Promise<Blob> {
    return (await api.get<Blob>(`/attachments/${id}/download`, { responseType: 'blob' })).data;
  },
};
