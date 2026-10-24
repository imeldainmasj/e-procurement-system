import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { resetDatabase } from '../test/db.js';
import { formatDocumentNumber, nextAssetTag, nextDocumentNumber } from './numbering.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('document numbering', () => {
  it('formats {PREFIX}/{YYYY}/{MM}/{NNNN} in Asia/Jakarta time', () => {
    // 31 Oct 2026 20:00 UTC is already 1 Nov in Jakarta (UTC+7).
    expect(formatDocumentNumber('PR-IT', new Date('2026-10-31T20:00:00Z'), 7)).toBe(
      'PR-IT/2026/11/0007',
    );
  });

  it('increments per prefix', async () => {
    const date = new Date('2026-10-24T03:00:00Z');
    const a = await prisma.$transaction((tx) => nextDocumentNumber(tx, 'PR-IT', date));
    const b = await prisma.$transaction((tx) => nextDocumentNumber(tx, 'PR-IT', date));
    const memo = await prisma.$transaction((tx) => nextDocumentNumber(tx, 'MEMO-IT', date));
    expect([a, b, memo]).toEqual([
      'PR-IT/2026/10/0001',
      'PR-IT/2026/10/0002',
      'MEMO-IT/2026/10/0001',
    ]);
  });

  it('keeps counting across months but resets each year', async () => {
    const next = (iso: string) =>
      prisma.$transaction((tx) => nextDocumentNumber(tx, 'PO-IT', new Date(iso)));
    expect(await next('2026-11-10T03:00:00Z')).toBe('PO-IT/2026/11/0001');
    expect(await next('2026-12-10T03:00:00Z')).toBe('PO-IT/2026/12/0002');
    expect(await next('2027-01-05T03:00:00Z')).toBe('PO-IT/2027/01/0001');
  });

  it('never hands out the same number under concurrency', async () => {
    const date = new Date('2026-10-24T03:00:00Z');
    const numbers = await Promise.all(
      Array.from({ length: 15 }, () =>
        prisma.$transaction((tx) => nextDocumentNumber(tx, 'GR-IT', date)),
      ),
    );
    expect(new Set(numbers).size).toBe(15);
    expect(numbers.sort().at(-1)).toBe('GR-IT/2026/10/0015');
  });

  it('does not consume a number when the transaction rolls back', async () => {
    const date = new Date('2026-10-24T03:00:00Z');
    await expect(
      prisma.$transaction(async (tx) => {
        await nextDocumentNumber(tx, 'KTR-IT', date);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await prisma.$transaction((tx) => nextDocumentNumber(tx, 'KTR-IT', date))).toBe(
      'KTR-IT/2026/10/0001',
    );
  });

  it('formats asset tags without yearly reset', async () => {
    const tags = [
      await prisma.$transaction((tx) => nextAssetTag(tx)),
      await prisma.$transaction((tx) => nextAssetTag(tx)),
    ];
    expect(tags).toEqual(['AST-IT-000001', 'AST-IT-000002']);
  });
});
