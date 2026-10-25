import type { ApiSuccess, ExportFormat, ReportName } from '@sipita/shared';
import { api } from './client';
import { downloadFile } from './download.api';
import { cleanParams } from './resource';

export type ReportParams = Record<string, string | number | boolean | undefined>;

export const reportsApi = {
  async get<T>(name: ReportName, params: ReportParams): Promise<T> {
    const res = await api.get<ApiSuccess<T>>(`/reports/${name}`, { params: cleanParams(params) });
    return res.data.data;
  },
  /** Excel/PDF export of the same query; returns the file and its server-side name. */
  download(name: ReportName, params: ReportParams, format: Exclude<ExportFormat, 'json'>) {
    return downloadFile(`/reports/${name}`, { ...params, format }, `sipita-${name}.${format}`);
  },
};
