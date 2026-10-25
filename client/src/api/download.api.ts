import { api } from './client';
import { cleanParams } from './resource';

/** GETs a generated file (Excel/PDF export) and returns it with its server-side name. */
export async function downloadFile(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  fallbackName: string,
): Promise<{ blob: Blob; fileName: string }> {
  const res = await api.get<Blob>(path, { params: cleanParams(params), responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  return { blob: res.data, fileName };
}
