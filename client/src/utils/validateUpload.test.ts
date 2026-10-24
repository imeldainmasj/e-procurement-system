import { describe, expect, it } from 'vitest';
import { validateUpload } from './validateUpload';

const file = (name: string, type: string, size = 100) =>
  new File([new Uint8Array(size)], name, { type });

describe('validateUpload', () => {
  it('accepts whitelisted files within the size limit', () => {
    expect(validateUpload(file('siup.pdf', 'application/pdf'))).toBeNull();
  });

  it('rejects other types and mismatched extensions', () => {
    expect(validateUpload(file('setup.exe', 'application/x-msdownload'))).toMatch(/Tipe file/);
    expect(validateUpload(file('foto.pdf', 'image/png'))).toMatch(/Tipe file/);
  });

  it('rejects files above the limit', () => {
    expect(validateUpload(file('besar.pdf', 'application/pdf', 2 * 1024 * 1024), 1)).toBe(
      'Ukuran file maksimal 1 MB',
    );
  });
});
