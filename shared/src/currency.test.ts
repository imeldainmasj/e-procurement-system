import { describe, expect, it } from 'vitest';
import { formatRupiah } from './currency.js';

describe('formatRupiah', () => {
  it('formats with dot thousand separators', () => {
    expect(formatRupiah(1250000)).toBe('Rp 1.250.000');
  });

  it('handles zero, negatives, strings and nullish', () => {
    expect(formatRupiah(0)).toBe('Rp 0');
    expect(formatRupiah(-5000)).toBe('-Rp 5.000');
    expect(formatRupiah('75000.00')).toBe('Rp 75.000');
    expect(formatRupiah(null)).toBe('Rp 0');
  });
});
