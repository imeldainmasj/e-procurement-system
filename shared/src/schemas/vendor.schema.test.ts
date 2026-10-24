import { describe, expect, it } from 'vitest';
import '../zod.js';
import { isAllowedUpload } from '../uploads.js';
import { formatNpwp, vendorInputSchema } from './vendor.schema.js';

const base = { code: 'v001', name: 'PT Contoh', address: 'Jakarta', picName: 'Rina' };

describe('vendorInputSchema', () => {
  it('normalizes code, NPWP, email and empty fields', () => {
    const v = vendorInputSchema.parse({
      ...base,
      npwp: '01.234.567.8-901.000',
      email: ' Sales@Contoh.CO.ID ',
      phone: '',
    });
    expect(v).toMatchObject({
      code: 'V001',
      npwp: '012345678901000',
      email: 'sales@contoh.co.id',
      phone: null,
    });
  });

  it('requires address and PIC (template columns marked *)', () => {
    expect(vendorInputSchema.safeParse({ ...base, address: '' }).success).toBe(false);
    expect(vendorInputSchema.safeParse({ ...base, picName: ' ' }).success).toBe(false);
  });

  it('accepts 16-digit NPWP and rejects other lengths', () => {
    expect(vendorInputSchema.safeParse({ ...base, npwp: '3171234567890001' }).success).toBe(true);
    expect(vendorInputSchema.safeParse({ ...base, npwp: '12345' }).success).toBe(false);
  });

  it('formats 15-digit NPWP', () => {
    expect(formatNpwp('012345678901000')).toBe('01.234.567.8-901.000');
  });
});

describe('isAllowedUpload', () => {
  it('checks both MIME type and extension', () => {
    expect(isAllowedUpload('application/pdf', 'memo.PDF')).toBe(true);
    expect(isAllowedUpload('application/pdf', 'memo.exe')).toBe(false);
    expect(isAllowedUpload('application/x-msdownload', 'virus.pdf')).toBe(false);
  });
});
