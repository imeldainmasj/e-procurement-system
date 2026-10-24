import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './formatDate';

describe('formatDate', () => {
  it('uses Indonesian month names', () => {
    expect(formatDate('2026-10-24')).toBe('24 Okt 2026');
    expect(formatDate('2026-05-01', 'D MMMM YYYY')).toBe('1 Mei 2026');
  });

  it('returns "-" for empty values', () => {
    expect(formatDate(null)).toBe('-');
  });

  it('formats date-time', () => {
    expect(formatDateTime(new Date(2026, 9, 24, 14, 30))).toBe('24 Okt 2026 14:30');
  });
});
