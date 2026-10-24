import { attachmentsApi } from '@/api/vendors.api';
import { downloadBlob } from './download';

export async function downloadAttachment(id: string, fileName: string): Promise<void> {
  downloadBlob(await attachmentsApi.download(id), fileName);
}

/**
 * Opens a PDF/image in a new tab. The tab is opened synchronously (inside the click) so
 * popup blockers allow it, then pointed at the authenticated blob once it has loaded.
 */
export async function previewAttachment(id: string): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await attachmentsApi.download(id));
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

export const canPreview = (mimeType: string) =>
  mimeType === 'application/pdf' || mimeType.startsWith('image/');
