import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { resetDatabase } from '../test/db.js';
import { formatWorkCode, nextWorkCode } from './numbering.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const next = (year: number) => prisma.$transaction((tx) => nextWorkCode(tx, year));

describe('work code numbering', () => {
  it('formats WRK-{YYYY}-{NNNN}', () => {
    expect(formatWorkCode(2026, 7)).toBe('WRK-2026-0007');
  });

  it('counts per procurement year, including historical years', async () => {
    expect(await next(2026)).toBe('WRK-2026-0001');
    expect(await next(2026)).toBe('WRK-2026-0002');
    expect(await next(2015)).toBe('WRK-2015-0001');
    expect(await next(2026)).toBe('WRK-2026-0003');
  });

  it('never hands out the same code under concurrency', async () => {
    const codes = await Promise.all(Array.from({ length: 15 }, () => next(2026)));
    expect(new Set(codes).size).toBe(15);
    expect(codes.sort().at(-1)).toBe('WRK-2026-0015');
  });

  it('does not consume a number when the transaction rolls back', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await nextWorkCode(tx, 2026);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await next(2026)).toBe('WRK-2026-0001');
  });
});
