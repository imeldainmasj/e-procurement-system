import type { ApiSuccess, ExportFormat, ReportName } from '@sipita/shared';
import { api } from './client';
import { cleanParams } from './resource';

export type ReportParams = Record<string, string | number | boolean | undefined>;

export const reportsApi = {
  async get<T>(name: ReportName, params: ReportParams): Promise<T> {
    const res = await api.get<ApiSuccess<T>>(`/reports/${name}`, { params: cleanParams(params) });
    return res.data.data;
  },
  /** Excel/PDF export of the same query; returns the file and its server-side name. */
  async download(name: ReportName, params: ReportParams, format: Exclude<ExportFormat, 'json'>) {
    const res = await api.get<Blob>(`/reports/${name}`, {
      params: cleanParams({ ...params, format }),
      responseType: 'blob',
    });
    const disposition = String(res.headers['content-disposition'] ?? '');
    const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `sipita-${name}.${format}`;
    return { blob: res.data, fileName };
  },
};
