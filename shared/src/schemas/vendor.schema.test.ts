import { describe, expect, it } from 'vitest';
import '../zod.js';
import { isAllowedUpload } from '../uploads.js';
import {
  documentExpiryState,
  formatNpwp,
  vendorInputSchema,
  vendorStatusInputSchema,
} from './vendor.schema.js';

const base = { code: 'vnd-01', name: 'PT Contoh' };

describe('vendorInputSchema', () => {
  it('normalizes NPWP, email, bank account and empty fields', () => {
    const v = vendorInputSchema.parse({
      ...base,
      npwp: '01.234.567.8-901.000',
      email: ' Sales@Contoh.CO.ID ',
      bankAccount: '123-456 7890',
      phone: '',
    });
    expect(v).toMatchObject({
      code: 'VND-01',
      npwp: '012345678901000',
      email: 'sales@contoh.co.id',
      bankAccount: '1234567890',
      phone: null,
      categoryIds: [],
    });
  });

  it('accepts 16-digit NPWP and rejects other lengths', () => {
    expect(vendorInputSchema.safeParse({ ...base, npwp: '3171234567890001' }).success).toBe(true);
    expect(vendorInputSchema.safeParse({ ...base, npwp: '12345' }).success).toBe(false);
  });

  it('formats 15-digit NPWP', () => {
    expect(formatNpwp('012345678901000')).toBe('01.234.567.8-901.000');
  });
});

describe('vendorStatusInputSchema', () => {
  it('requires a reason only for blacklisting', () => {
    expect(vendorStatusInputSchema.safeParse({ status: 'BLACKLISTED' }).success).toBe(false);
    expect(
      vendorStatusInputSchema.safeParse({ status: 'BLACKLISTED', reason: 'Wanprestasi' }).success,
    ).toBe(true);
    expect(vendorStatusInputSchema.safeParse({ status: 'ACTIVE' }).success).toBe(true);
  });
});

describe('documentExpiryState', () => {
  it('classifies relative to today', () => {
    expect(documentExpiryState(null, '2026-10-24')).toBe('none');
    expect(documentExpiryState('2026-10-23', '2026-10-24')).toBe('expired');
    expect(documentExpiryState('2026-10-24', '2026-10-24')).toBe('expiring');
    expect(documentExpiryState('2026-11-23', '2026-10-24')).toBe('expiring');
    expect(documentExpiryState('2026-11-24', '2026-10-24')).toBe('valid');
  });
});

describe('isAllowedUpload', () => {
  it('checks both MIME type and extension', () => {
    expect(isAllowedUpload('application/pdf', 'siup.PDF')).toBe(true);
    expect(isAllowedUpload('application/pdf', 'siup.exe')).toBe(false);
    expect(isAllowedUpload('application/x-msdownload', 'virus.pdf')).toBe(false);
  });
});
