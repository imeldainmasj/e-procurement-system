/**
 * Checks the first bytes of an upload against its declared MIME type, so a renamed
 * executable cannot pass as a PDF just by its extension and Content-Type header.
 */
const SIGNATURES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46, 0x2d]], // %PDF-
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  // Office Open XML files are ZIP archives.
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    [0x50, 0x4b, 0x03, 0x04],
  ],
};

export function matchesSignature(buffer: Buffer, mimeType: string): boolean {
  const candidates = SIGNATURES[mimeType];
  if (!candidates) return false;
  return candidates.some(
    (sig) => buffer.length >= sig.length && sig.every((byte, i) => buffer[i] === byte),
  );
}
