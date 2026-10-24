import type { VendorDto, VendorInput } from '@sipita/shared';
import { api } from './client';
import { createResourceApi } from './resource';

export const vendorsApi = createResourceApi<VendorDto, VendorInput>('/vendors');

export const attachmentsApi = {
  async download(id: string): Promise<Blob> {
    return (await api.get<Blob>(`/attachments/${id}/download`, { responseType: 'blob' })).data;
  },
};
