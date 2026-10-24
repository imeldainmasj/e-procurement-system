import { Prisma } from '../generated/prisma/client.js';

export const num = (d: Prisma.Decimal) => Number(d.toString());
export const numOrNull = (d: Prisma.Decimal | null) => (d === null ? null : num(d));

/** amount × rate in Decimal arithmetic, rounded to 2 decimals (CLAUDE.md §6 Mata Uang). */
export function amountInIdr(amount: number, exchangeRate: number): Prisma.Decimal {
  return new Prisma.Decimal(amount).mul(exchangeRate).toDecimalPlaces(2);
}
