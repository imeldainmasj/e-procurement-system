/** Upload whitelist (CLAUDE.md §10), shared so the client can validate before sending. */
export const ALLOWED_UPLOADS = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
} as const satisfies Record<string, readonly string[]>;

export type AllowedMimeType = keyof typeof ALLOWED_UPLOADS;

export const ALLOWED_UPLOAD_EXTENSIONS: string[] = Object.values(ALLOWED_UPLOADS).flat();

export function isAllowedUpload(mimeType: string, fileName: string): boolean {
  const extensions = (ALLOWED_UPLOADS as Record<string, readonly string[]>)[mimeType];
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  return Boolean(extensions?.includes(ext));
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
