import type { ApiSuccess, ImportBatchDto, ImportIssueDto } from '@sipita/shared';
import { api } from './client';
import { cleanParams, type ListParams, type ListResult } from './resource';

export const importsApi = {
  async template(): Promise<Blob> {
    return (await api.get<Blob>('/imports/template', { responseType: 'blob' })).data;
  },
  async list(params: ListParams): Promise<ListResult<ImportBatchDto>> {
    const res = await api.get<ApiSuccess<ImportBatchDto[]>>('/imports', {
      params: cleanParams(params),
    });
    return { data: res.data.data, meta: res.data.meta! };
  },
  async get(id: string): Promise<ImportBatchDto> {
    return (await api.get<ApiSuccess<ImportBatchDto>>(`/imports/${id}`)).data.data;
  },
  async issues(
    id: string,
    params: { page: number; limit: number; level?: string; sheet?: string },
  ): Promise<ListResult<ImportIssueDto>> {
    const res = await api.get<ApiSuccess<ImportIssueDto[]>>(`/imports/${id}/issues`, {
      params: cleanParams(params),
    });
    return { data: res.data.data, meta: res.data.meta! };
  },
  async upload(file: File, onProgress?: (percent: number) => void): Promise<ImportBatchDto> {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post<ApiSuccess<ImportBatchDto>>('/imports', form, {
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
    });
    return res.data.data;
  },
  async commit(id: string): Promise<ImportBatchDto> {
    return (await api.post<ApiSuccess<ImportBatchDto>>(`/imports/${id}/commit`)).data.data;
  },
  async rollback(id: string): Promise<ImportBatchDto> {
    return (await api.post<ApiSuccess<ImportBatchDto>>(`/imports/${id}/rollback`)).data.data;
  },
  cancel: (id: string) => api.delete(`/imports/${id}`),
};
