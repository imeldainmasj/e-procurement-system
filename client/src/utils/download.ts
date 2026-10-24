/** Saves a blob under `fileName` via a temporary link. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "MEMO-IT/2026/10/0001" → "MEMO-IT-2026-10-0001.pdf" */
export const pdfFileName = (number: string) => `${number.replaceAll('/', '-')}.pdf`;
